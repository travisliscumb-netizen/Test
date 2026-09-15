// Cashpilot — the agent loop.
//
// A manual loop rather than the SDK tool runner, for the same reason the API
// client is raw fetch: no bundler in this project. The loop is small; the parts
// that are easy to get wrong are called out inline.

import { createMessageWithRetry, textOf, toolUsesOf, refusalOf, AnthropicError } from './anthropic.js';
import { TOOL_DEFS, runTool, MUTATING_TOOLS } from './tools.js';
import { AGENT_MAX_TOKENS, AGENT_MAX_TURNS, EXPENSE_CATEGORIES, INCOME_CATEGORIES, DBX_ROOT, CURRENCY } from './config.js';
import { getData, mutate } from './store.js';
import { toISODate, formatMoney } from './util.js';
import * as A from './analytics.js';

/** Built fresh each turn so "today" and the ledger shape are never stale. */
export function systemPrompt() {
  const data = getData();
  const asOf = toISODate();
  const sts = A.safeToSpend(data, { asOf });
  const profile = A.incomeProfile(data, { asOf });

  return [
    `You are Cashpilot, the assistant inside a personal finance app. You are talking to the person whose money this is. Today is ${asOf}. All amounts are ${CURRENCY}.`,
    '',
    'HOW TO WORK',
    '- Use tools to look things up. Never state a figure from memory or from earlier in the conversation; the ledger changes as you work, so re-query before you assert.',
    '- Prefer get_analytics over adding up transactions yourself. Those are the exact figures the dashboard shows, and disagreeing with the screen in front of the user is worse than being slower.',
    '- When the user asks you to record something, record it. You have write access and they have already granted it; do not ask for permission you already have.',
    '- Do ask before doing something irreversible or clearly outside what was requested — deleting rows the user did not mention, or reorganising files they did not ask you to touch.',
    '- Batch work: one add_transactions call with ten items, not ten calls.',
    '',
    'MONEY RULES',
    '- Amounts you pass to tools are positive dollar numbers. The "kind" field decides the sign. Never pass a negative number for an expense.',
    '- A receipt total is an expense. A pay stub net is income. Moving money between the user\'s own accounts is a transfer and must not be counted as either.',
    '- If you cannot read a figure with confidence, say so and ask, rather than recording a guess. A wrong number in a ledger is worse than a missing one.',
    '',
    'READING DOCUMENTS',
    `- The user drops receipts and pay-stub screenshots into Dropbox at ${DBX_ROOT}/Inbox, and can also photograph them in the app.`,
    '- Use dropbox_list to see what is waiting, read_document to look at it, then add_transactions to record it, passing document_id so the record links to the image.',
    '- After recording a file from the Inbox, file it with dropbox_organize into Receipts/YYYY-MM or Paystubs/YYYY-MM so the Inbox stays a genuine to-do list.',
    '- On a pay stub, record the NET pay as the income amount and put gross and deductions in their own fields. Recording gross as income overstates earnings badly.',
    '',
    'ANSWERING',
    '- Lead with the number or the answer. Show the arithmetic when it is not obvious.',
    '- Be concrete about savings advice: name the merchant, the amount, and the annual impact. "Consider reducing discretionary spending" is worthless.',
    '- Be direct when the picture is bad. This person needs an accurate read, not encouragement.',
    '- Plain prose and short lists. No headers for a two-sentence answer.',
    '',
    `CATEGORIES — expenses: ${EXPENSE_CATEGORIES.join(', ')}. Income: ${INCOME_CATEGORIES.join(', ')}.`,
    '',
    'CURRENT STATE (a snapshot for orientation only — re-query before quoting any of it)',
    `- Transactions on file: ${data.transactions.length}. Bills: ${data.bills.length}. Budgets: ${data.budgets.length}.`,
    `- Safe to spend this month: ${formatMoney(sts.safeCents)}${sts.incomeForecastIsPartial ? ' (income cadence not yet established, so remaining income counts as zero)' : ''}.`,
    profile.cadence
      ? `- Pay cadence: ${profile.cadence}, averaging ${formatMoney(profile.averageNetCents)} net, last on ${profile.lastPayDate}.`
      : '- Pay cadence: not yet established (fewer than two pay events on file).',
  ].join('\n');
}

/**
 * Run one user turn to completion.
 *
 * @param {Array} history  Prior messages in Messages API shape. Mutated in place.
 * @param {Array|string} userContent  The new user message content.
 * @param {object} opts
 * @param {(ev: object) => void} opts.onEvent  Progress callback for the UI.
 * @param {AbortSignal} opts.signal
 * @returns {Promise<{text: string, history: Array, toolCalls: Array, stopped: string}>}
 */
export async function runAgent(history, userContent, { onEvent = () => {}, signal } = {}) {
  history.push({ role: 'user', content: userContent });

  const toolCalls = [];
  let turns = 0;

  while (turns++ < AGENT_MAX_TURNS) {
    if (signal?.aborted) return { text: '', history, toolCalls, stopped: 'aborted' };

    onEvent({ type: 'thinking', turn: turns });

    let response;
    try {
      response = await createMessageWithRetry({
        max_tokens: AGENT_MAX_TOKENS,
        system: systemPrompt(),
        tools: TOOL_DEFS,
        messages: history,
      }, { signal });
    } catch (err) {
      if (err?.name === 'AbortError') return { text: '', history, toolCalls, stopped: 'aborted' };
      throw err;
    }

    const refusal = refusalOf(response);
    if (refusal) {
      // stop_reason "refusal" arrives as HTTP 200; without this check the user
      // would just see an empty reply.
      history.push({ role: 'assistant', content: response.content || [] });
      return { text: refusal, history, toolCalls, stopped: 'refusal' };
    }

    // The whole content array goes back verbatim. Adaptive thinking is on by
    // default on this model, and thinking blocks that are filtered, reordered or
    // reconstructed cause a 400 on the next request.
    history.push({ role: 'assistant', content: response.content });

    const uses = toolUsesOf(response);

    if (response.stop_reason === 'max_tokens' && !uses.length) {
      return {
        text: `${textOf(response)}\n\n[The reply was cut off at the length limit.]`.trim(),
        history, toolCalls, stopped: 'max_tokens',
      };
    }

    if (!uses.length) {
      return { text: textOf(response), history, toolCalls, stopped: response.stop_reason || 'end_turn' };
    }

    // Any narration alongside the tool calls is worth showing while work happens.
    const preamble = textOf(response);
    if (preamble) onEvent({ type: 'text', text: preamble });

    // Run the calls concurrently, then return EVERY result in ONE user message.
    // Splitting results across messages teaches the model to stop batching.
    const results = await Promise.all(uses.map(async (use) => {
      onEvent({ type: 'tool-start', name: use.name, input: use.input, id: use.id });
      const result = await runTool(use.name, use.input, { onAudit: recordAudit });
      onEvent({
        type: 'tool-end',
        name: use.name,
        id: use.id,
        summary: result.summary,
        isError: Boolean(result.isError),
        mutating: MUTATING_TOOLS.has(use.name),
      });
      toolCalls.push({ name: use.name, input: use.input, summary: result.summary, isError: Boolean(result.isError) });
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      };
    }));

    history.push({ role: 'user', content: results });
  }

  return {
    text: 'I stopped after too many steps without finishing. Try narrowing the request.',
    history, toolCalls, stopped: 'max_turns',
  };
}

/** Append an AI mutation to the audit log so the user can see what changed. */
function recordAudit(entry) {
  void mutate((data) => {
    if (!Array.isArray(data.auditLog)) data.auditLog = [];
    data.auditLog.unshift(entry);
    // Bounded: this lives inside the synced data file.
    if (data.auditLog.length > 300) data.auditLog.length = 300;
  }, 'audit').catch((err) => console.error('audit write failed', err));
}

/**
 * Trim history to keep requests bounded on a long-running conversation.
 * Drops whole turns from the front, never partial ones — a tool_result orphaned
 * from its tool_use is a 400.
 */
export function trimHistory(history, maxMessages = 40) {
  if (history.length <= maxMessages) return history;
  let cut = history.length - maxMessages;
  // Advance the cut to the next user message that is not a tool_result batch,
  // so the surviving history always starts with a genuine user turn.
  while (cut < history.length) {
    const m = history[cut];
    const isToolResultBatch = Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result');
    if (m.role === 'user' && !isToolResultBatch) break;
    cut++;
  }
  return cut >= history.length ? history.slice(-2) : history.slice(cut);
}

export { AnthropicError };

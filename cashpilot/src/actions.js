// Cashpilot — the mutation API.
//
// Both the UI and the AI agent call exactly these functions. The agent gets no
// privileged path into the data: if an operation is not here, the AI cannot do
// it, and every write it makes is validated by the same model code a human
// button press goes through.

import { mutate, getData, tombstone } from './store.js';
import * as dbx from './dropbox.js';
import { putBlob, deleteBlob } from './blobs.js';
import {
  makeTransaction, updateTransaction, makeBill, makeBudget, makeGoal, makeRule,
  makeDocument, categoryForMerchant, ValidationError,
} from './model.js';
import { DBX_RECEIPTS, DBX_PAYSTUBS, DBX_INBOX, DBX_REPORTS } from './config.js';
import { uid, toISODate, monthKey, normalizeMerchant } from './util.js';

// --- transactions ------------------------------------------------------------

export async function addTransaction(input) {
  return mutate((data) => {
    const draft = { ...input };
    // Auto-categorize from learned rules when the caller did not choose one.
    if (!draft.category && draft.kind !== 'income') {
      const guess = categoryForMerchant(data.rules, draft.merchant);
      if (guess) draft.category = guess;
    }
    const tx = makeTransaction(draft);
    data.transactions.unshift(tx);
    data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return tx;
  }, 'transaction:add');
}

export async function addTransactions(inputs) {
  const added = [];
  const failed = [];
  await mutate((data) => {
    for (const input of inputs) {
      try {
        const draft = { ...input };
        if (!draft.category && draft.kind !== 'income') {
          const guess = categoryForMerchant(data.rules, draft.merchant);
          if (guess) draft.category = guess;
        }
        const tx = makeTransaction(draft);
        data.transactions.push(tx);
        added.push(tx);
      } catch (err) {
        // One bad row must not discard the whole batch — report it instead.
        failed.push({ input, error: err.message });
      }
    }
    data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, 'transaction:add-many');
  return { added, failed };
}

export async function editTransaction(id, patch) {
  return mutate((data) => {
    const i = data.transactions.findIndex((t) => t.id === id);
    if (i === -1) throw new ValidationError(`No transaction with id ${id}`, 'id');
    const next = updateTransaction(data.transactions[i], patch);
    data.transactions[i] = next;
    data.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return next;
  }, 'transaction:edit');
}

export async function deleteTransaction(id) {
  return mutate((data) => {
    const i = data.transactions.findIndex((t) => t.id === id);
    if (i === -1) throw new ValidationError(`No transaction with id ${id}`, 'id');
    const [removed] = data.transactions.splice(i, 1);
    tombstone(data, id);
    return removed;
  }, 'transaction:delete');
}

/** Bulk recategorize by merchant. Returns the rows actually changed. */
export async function recategorizeMerchant(merchantQuery, category, { alsoLearnRule = true } = {}) {
  const key = normalizeMerchant(merchantQuery);
  if (!key) throw new ValidationError('A merchant name is required', 'merchant');
  return mutate((data) => {
    const changed = [];
    for (let i = 0; i < data.transactions.length; i++) {
      const t = data.transactions[i];
      if (t.kind === 'income') continue;
      if (!normalizeMerchant(t.merchant).includes(key)) continue;
      if (t.category === category) continue;
      data.transactions[i] = updateTransaction(t, { category });
      changed.push(data.transactions[i]);
    }
    if (alsoLearnRule && changed.length) {
      const existing = data.rules.find((r) => r.match === key);
      if (existing) existing.category = category;
      else data.rules.push(makeRule({ match: key, category }));
    }
    return changed;
  }, 'transaction:recategorize');
}

// --- bills -------------------------------------------------------------------

export const addBill = (input) => mutate((data) => {
  const bill = makeBill(input);
  data.bills.push(bill);
  return bill;
}, 'bill:add');

export const editBill = (id, patch) => mutate((data) => {
  const i = data.bills.findIndex((b) => b.id === id);
  if (i === -1) throw new ValidationError(`No bill with id ${id}`, 'id');
  data.bills[i] = makeBill({ ...data.bills[i], ...patch, id });
  return data.bills[i];
}, 'bill:edit');

export const deleteBill = (id) => mutate((data) => {
  const i = data.bills.findIndex((b) => b.id === id);
  if (i === -1) throw new ValidationError(`No bill with id ${id}`, 'id');
  const [removed] = data.bills.splice(i, 1);
  tombstone(data, id);
  return removed;
}, 'bill:delete');

// --- budgets / goals / rules -------------------------------------------------

/** One budget per category: setting an existing category updates it. */
export const setBudget = (category, monthlyCents) => mutate((data) => {
  const next = makeBudget({ category, monthlyCents });
  const i = data.budgets.findIndex((b) => b.category === next.category);
  if (i === -1) data.budgets.push(next);
  else { next.id = data.budgets[i].id; data.budgets[i] = next; }
  return next;
}, 'budget:set');

export const deleteBudget = (category) => mutate((data) => {
  const i = data.budgets.findIndex((b) => b.category === category);
  if (i === -1) throw new ValidationError(`No budget for ${category}`, 'category');
  const [removed] = data.budgets.splice(i, 1);
  tombstone(data, removed.id);
  return removed;
}, 'budget:delete');

export const addGoal = (input) => mutate((data) => {
  const goal = makeGoal(input);
  data.goals.push(goal);
  return goal;
}, 'goal:add');

export const editGoal = (id, patch) => mutate((data) => {
  const i = data.goals.findIndex((g) => g.id === id);
  if (i === -1) throw new ValidationError(`No goal with id ${id}`, 'id');
  data.goals[i] = makeGoal({ ...data.goals[i], ...patch, id });
  return data.goals[i];
}, 'goal:edit');

export const deleteGoal = (id) => mutate((data) => {
  const i = data.goals.findIndex((g) => g.id === id);
  if (i === -1) throw new ValidationError(`No goal with id ${id}`, 'id');
  const [removed] = data.goals.splice(i, 1);
  tombstone(data, id);
  return removed;
}, 'goal:delete');

export const setSetting = (key, value) => mutate((data) => {
  data.settings[key] = value;
  return data.settings;
}, 'settings:set');

// --- documents ---------------------------------------------------------------

/**
 * Store an uploaded or captured file.
 *
 * The blob always lands in IndexedDB so the app works offline; when Dropbox is
 * connected it is also uploaded, which is what makes the file reachable from
 * another device and from the AI's Dropbox tools.
 */
export async function addDocument(blob, { name, kind = 'other', txId = null } = {}) {
  const safeName = sanitizeFilename(name || `${kind}-${toISODate()}.jpg`);
  const blobKey = uid('blob');
  await putBlob(blobKey, blob);

  let dropboxPath = null;
  let uploadError = null;
  if (dbx.isConnected()) {
    const folder = kind === 'receipt' ? DBX_RECEIPTS : kind === 'paystub' ? DBX_PAYSTUBS : DBX_INBOX;
    const dated = `${folder}/${monthKey(toISODate())}`;
    try {
      await dbx.createFolder(dated);
      const res = await dbx.upload(`${dated}/${safeName}`, blob, { autorename: true, mode: 'add' });
      dropboxPath = res.path_display || res.path_lower || null;
    } catch (err) {
      // Local copy already succeeded; surface the failure without losing the file.
      uploadError = err.message;
    }
  }

  const doc = await mutate((data) => {
    const d = makeDocument({ name: safeName, kind, mime: blob.type, size: blob.size, dropboxPath, blobKey, txId });
    data.documents.unshift(d);
    return d;
  }, 'document:add');

  return { doc, uploadError };
}

export async function linkDocumentToTransaction(docId, txId) {
  return mutate((data) => {
    const doc = data.documents.find((d) => d.id === docId);
    if (!doc) throw new ValidationError(`No document with id ${docId}`, 'docId');
    const tx = data.transactions.find((t) => t.id === txId);
    if (!tx) throw new ValidationError(`No transaction with id ${txId}`, 'txId');
    doc.txId = txId;
    if (!tx.docIds.includes(docId)) tx.docIds.push(docId);
    return doc;
  }, 'document:link');
}

export async function deleteDocument(id, { alsoDropbox = false } = {}) {
  const data = getData();
  const doc = data.documents.find((d) => d.id === id);
  if (!doc) throw new ValidationError(`No document with id ${id}`, 'id');
  if (doc.blobKey) await deleteBlob(doc.blobKey).catch(() => {});
  if (alsoDropbox && doc.dropboxPath && dbx.isConnected()) {
    await dbx.deletePath(doc.dropboxPath).catch(() => {});
  }
  return mutate((d) => {
    d.documents = d.documents.filter((x) => x.id !== id);
    for (const t of d.transactions) {
      if (t.docIds?.includes(id)) t.docIds = t.docIds.filter((x) => x !== id);
    }
    tombstone(d, id);
    return doc;
  }, 'document:delete');
}

/** Write a text report into /Cashpilot/Reports. */
export async function writeReport(filename, text) {
  if (!dbx.isConnected()) throw new Error('Dropbox is not connected, so there is nowhere to save the report.');
  const safe = sanitizeFilename(filename.endsWith('.md') || filename.endsWith('.csv') || filename.endsWith('.txt')
    ? filename : `${filename}.md`);
  await dbx.createFolder(DBX_REPORTS);
  const res = await dbx.upload(`${DBX_REPORTS}/${safe}`, new Blob([text], { type: 'text/plain' }), {
    autorename: true, mode: 'add',
  });
  return res.path_display || res.path_lower;
}

/** Strip path separators and characters Dropbox rejects. */
export function sanitizeFilename(name) {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return (cleaned || 'file').slice(0, 180);
}

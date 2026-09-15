// Cashpilot — central configuration.
// Every tunable constant lives here so there is exactly one place to change them.

export const APP_NAME = 'Cashpilot';
export const APP_VERSION = '1.0.0';

// --- Anthropic ---------------------------------------------------------------
// Direct browser access to the Messages API. The key is supplied by the user and
// stored only in this browser; see README "Security model" for the tradeoff.
export const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2023-06-01';
export const MODEL_AGENT = 'claude-opus-5';
export const MODEL_EXTRACT = 'claude-opus-5';
export const AGENT_MAX_TOKENS = 16000;
export const EXTRACT_MAX_TOKENS = 4000;
export const AGENT_MAX_TURNS = 24;

// Opt into server-side refusal fallbacks. If the deployment rejects the beta the
// client retries once without it (see anthropic.js), so this can never hard-fail.
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// --- Dropbox -----------------------------------------------------------------
// PKCE public client: an app key is not a secret, but it is per-user, so it is
// entered in Settings rather than baked in.
export const DROPBOX_AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
export const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
export const DROPBOX_API = 'https://api.dropboxapi.com/2';
export const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';

export const DROPBOX_SCOPES = [
  'account_info.read',
  'files.metadata.read',
  'files.metadata.write',
  'files.content.read',
  'files.content.write',
].join(' ');

// Root of everything Cashpilot owns in Dropbox. Nothing outside this is written.
export const DBX_ROOT = '/Cashpilot';
export const DBX_DATA = `${DBX_ROOT}/data.json`;
export const DBX_INBOX = `${DBX_ROOT}/Inbox`;
export const DBX_RECEIPTS = `${DBX_ROOT}/Receipts`;
export const DBX_PAYSTUBS = `${DBX_ROOT}/Paystubs`;
export const DBX_REPORTS = `${DBX_ROOT}/Reports`;
export const DBX_FOLDERS = [DBX_ROOT, DBX_INBOX, DBX_RECEIPTS, DBX_PAYSTUBS, DBX_REPORTS];

// Dropbox refuses `upload` over 150 MB; we cap far below that for phone photos.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Vision limits: the API caps a base64 image at 10 MB and downscales above
// 2576px on the long edge anyway, so shrink before spending tokens on it.
export const VISION_MAX_EDGE = 1600;
export const VISION_JPEG_QUALITY = 0.82;

// --- Money -------------------------------------------------------------------
// All money is stored as integer cents. Never floats. See util.js.
export const CURRENCY = 'CAD';
export const LOCALE = 'en-CA';

export const EXPENSE_CATEGORIES = [
  'Groceries', 'Dining', 'Gas', 'Transit', 'Auto', 'Rent', 'Utilities',
  'Phone', 'Internet', 'Insurance', 'Childcare', 'Health', 'Shopping',
  'Entertainment', 'Subscriptions', 'Travel', 'Debt', 'Savings', 'Fees',
  'Gifts', 'Home', 'Pets', 'Education', 'Other',
];

// Categories that are not true consumption — excluded from "spending" analytics
// so that moving money to savings does not read as an expense.
export const NON_SPEND_CATEGORIES = new Set(['Savings']);

export const INCOME_CATEGORIES = [
  'Salary', 'Hourly', 'Bonus', 'Overtime', 'Self-employment',
  'Benefit', 'Refund', 'Gift', 'Interest', 'Other',
];

export const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'];

// Multiplier from one occurrence to a monthly-equivalent amount.
export const FREQ_PER_MONTH = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export const FREQ_DAYS = {
  weekly: 7, biweekly: 14, semimonthly: 15,
  monthly: 30.44, quarterly: 91.31, yearly: 365.25,
};

// --- Storage keys ------------------------------------------------------------
export const LS = {
  settings: 'cashpilot.settings.v1',
  dropboxToken: 'cashpilot.dropbox.token.v1',
  pkceVerifier: 'cashpilot.dropbox.pkce.v1',
  anthropicKey: 'cashpilot.anthropic.key.v1',
  chat: 'cashpilot.chat.v1',
};

export const IDB_NAME = 'cashpilot';
export const IDB_VERSION = 1;
export const IDB_STORE_DATA = 'data';
export const IDB_STORE_BLOBS = 'blobs';

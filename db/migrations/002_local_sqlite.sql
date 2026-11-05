PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('PERSON','ORGANIZATION')),
  roles TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, type TEXT NOT NULL,
  arrangement TEXT NOT NULL, borrower_id TEXT REFERENCES parties(id), manager_id TEXT REFERENCES parties(id),
  face_paise INTEGER NOT NULL CHECK(face_paise > 0), interest_paise INTEGER NOT NULL CHECK(interest_paise >= 0),
  net_paise INTEGER NOT NULL CHECK(net_paise >= 0), rate_text TEXT NOT NULL,
  rounding_policy TEXT NOT NULL, agreement_date TEXT NOT NULL, funded_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(face_paise = interest_paise + net_paise)
);
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), party_id TEXT NOT NULL REFERENCES parties(id),
  input_basis TEXT NOT NULL, entered_paise INTEGER NOT NULL,
  face_paise INTEGER NOT NULL, net_paise INTEGER NOT NULL, profit_paise INTEGER NOT NULL,
  UNIQUE(account_id, party_id), CHECK(face_paise = net_paise + profit_paise)
);
CREATE TABLE IF NOT EXISTS installments (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), sequence_no INTEGER NOT NULL,
  due_date TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  manually_overridden INTEGER NOT NULL DEFAULT 0, UNIQUE(account_id, sequence_no)
);
CREATE TABLE IF NOT EXISTS cheques (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), installment_id TEXT NOT NULL REFERENCES installments(id),
  number TEXT NOT NULL, bank TEXT NOT NULL, cheque_date TEXT NOT NULL, deposit_date TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), status TEXT NOT NULL,
  deposited_at TEXT, cleared_at TEXT, bounced_at TEXT, created_at TEXT NOT NULL,
  UNIQUE(account_id, number)
);
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), installment_id TEXT REFERENCES installments(id),
  cheque_id TEXT UNIQUE REFERENCES cheques(id), source TEXT NOT NULL, method TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), received_date TEXT NOT NULL,
  external_ref TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'CONFIRMED',
  reversal_of TEXT REFERENCES receipts(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS distributions (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), contribution_id TEXT NOT NULL REFERENCES contributions(id),
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0), paid_date TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), entity TEXT NOT NULL,
  entity_id TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS request_keys (
  key TEXT PRIMARY KEY, actor_id TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type, arrangement);
CREATE INDEX IF NOT EXISTS idx_installments_due ON installments(due_date, account_id);
CREATE INDEX IF NOT EXISTS idx_cheques_deposit ON cheques(deposit_date, status);
CREATE INDEX IF NOT EXISTS idx_receipts_account ON receipts(account_id, installment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_reversal ON receipts(reversal_of) WHERE reversal_of IS NOT NULL;

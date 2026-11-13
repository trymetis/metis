CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  to_address TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL,
  prev_folder TEXT,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  body_text TEXT,
  date TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  message_id_header TEXT,
  references_header TEXT,
  in_reply_to TEXT,
  list_unsubscribe TEXT,
  list_unsubscribe_post TEXT,
  attachments_json TEXT NOT NULL DEFAULT '[]',
  raw_key TEXT,
  resend_email_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_folder_date ON messages (to_address, folder, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (to_address, thread_id, date ASC);
CREATE INDEX IF NOT EXISTS idx_messages_starred ON messages (to_address, is_starred, date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON messages (to_address, message_id_header);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_resend_id ON messages (resend_email_id);

CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

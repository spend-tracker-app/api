CREATE TABLE IF NOT EXISTS merchant_mcc_cache (
  id BIGSERIAL PRIMARY KEY,
  merchant_normalized TEXT UNIQUE NOT NULL,
  merchant_original TEXT,
  mcc_code VARCHAR(4),
  mcc_description TEXT,
  category TEXT,
  manual_override BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcc_reference (
  mcc TEXT PRIMARY KEY,
  edited_description TEXT,
  combined_description TEXT,
  usda_description TEXT,
  irs_description TEXT,
  irs_reportable TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcc_reference_mcc ON mcc_reference (mcc);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  bank TEXT NOT NULL,
  identifier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank, identifier)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id),
  merchant TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  amount_base_currency NUMERIC(12,2),
  base_currency VARCHAR(3) DEFAULT 'SGD',
  category TEXT,
  mcc_code TEXT,
  transaction_timestamp TIMESTAMPTZ NOT NULL,
  transaction_hash TEXT UNIQUE,
  merchant_id BIGINT REFERENCES merchant_mcc_cache(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

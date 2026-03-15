CREATE TABLE merchant_mcc_cache (
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

CREATE TABLE mcc_reference (
  mcc TEXT PRIMARY KEY,
  edited_description TEXT,
  combined_description TEXT,
  usda_description TEXT,
  irs_description TEXT,
  irs_reportable TEXT
);

COPY mcc_reference (
  mcc,
  edited_description,
  combined_description,
  usda_description,
  irs_description,
  irs_reportable
)
FROM '/mcc/mcclist.csv'
WITH (FORMAT csv, HEADER true);

CREATE INDEX IF NOT EXISTS idx_mcc_reference_mcc ON mcc_reference (mcc);

CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  bank TEXT NOT NULL,
  identifier TEXT,
  card_alias TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank, identifier)
);

CREATE TABLE transactions (
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

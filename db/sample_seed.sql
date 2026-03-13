BEGIN;

INSERT INTO mcc_reference (
  mcc,
  edited_description,
  combined_description,
  usda_description,
  irs_description,
  irs_reportable
)
VALUES
  ('5411', 'Grocery Stores / Supermarkets', 'Groceries and household essentials', NULL, NULL, 'N'),
  ('5812', 'Eating Places & Restaurants', 'Dining and restaurants', NULL, NULL, 'N'),
  ('5814', 'Fast Food Restaurants', 'Quick service food and coffee', NULL, NULL, 'N'),
  ('5541', 'Service Stations', 'Fuel and petrol purchases', NULL, NULL, 'N'),
  ('4111', 'Local/Suburban Commuter Passenger Transport', 'Public transport and ride fares', NULL, NULL, 'N'),
  ('4814', 'Telecommunication Services', 'Mobile and internet bills', NULL, NULL, 'N'),
  ('4900', 'Utilities', 'Electricity, water and utilities', NULL, NULL, 'N'),
  ('5311', 'Department Stores', 'General retail shopping', NULL, NULL, 'N'),
  ('5732', 'Electronics Stores', 'Electronics and gadgets', NULL, NULL, 'N'),
  ('7011', 'Lodging - Hotels, Motels, Resorts', 'Travel accommodation', NULL, NULL, 'N')
ON CONFLICT (mcc) DO UPDATE SET
  edited_description = EXCLUDED.edited_description,
  combined_description = EXCLUDED.combined_description,
  irs_reportable = EXCLUDED.irs_reportable;

INSERT INTO accounts (bank, identifier)
VALUES
  ('Mari CC', '4040'),
  ('DBS PayLah', '91234567'),
  ('OCBC 360', '8899')
ON CONFLICT (bank, identifier) DO NOTHING;

INSERT INTO transactions (
  account_id,
  merchant,
  amount,
  currency,
  amount_base_currency,
  base_currency,
  category,
  mcc_code,
  transaction_timestamp,
  transaction_hash
)
VALUES
  ((SELECT id FROM accounts WHERE bank = 'Mari CC' AND identifier = '4040'), 'NTUC FAIRPRICE', 56.20, 'SGD', 56.20, 'SGD', 'Groceries', '5411', NOW() - INTERVAL '1 day', 'seed-txn-0001'),
  ((SELECT id FROM accounts WHERE bank = 'Mari CC' AND identifier = '4040'), 'STARBUCKS SG', 8.90, 'SGD', 8.90, 'SGD', 'Coffee', '5814', NOW() - INTERVAL '2 days', 'seed-txn-0002'),
  ((SELECT id FROM accounts WHERE bank = 'Mari CC' AND identifier = '4040'), 'SHELL STATION', 74.50, 'SGD', 74.50, 'SGD', 'Transport', '5541', NOW() - INTERVAL '3 days', 'seed-txn-0003'),
  ((SELECT id FROM accounts WHERE bank = 'DBS PayLah' AND identifier = '91234567'), 'GRAB SINGAPORE', 16.80, 'SGD', 16.80, 'SGD', 'Transport', '4111', NOW() - INTERVAL '4 days', 'seed-txn-0004'),
  ((SELECT id FROM accounts WHERE bank = 'DBS PayLah' AND identifier = '91234567'), 'DON DON DONKI', 33.70, 'SGD', 33.70, 'SGD', 'Groceries', '5411', NOW() - INTERVAL '5 days', 'seed-txn-0005'),
  ((SELECT id FROM accounts WHERE bank = 'DBS PayLah' AND identifier = '91234567'), 'MCDONALDS SG', 12.40, 'SGD', 12.40, 'SGD', 'Dining', '5814', NOW() - INTERVAL '6 days', 'seed-txn-0006'),
  ((SELECT id FROM accounts WHERE bank = 'OCBC 360' AND identifier = '8899'), 'SINGTEL MOBILE', 58.00, 'SGD', 58.00, 'SGD', 'Bills', '4814', NOW() - INTERVAL '7 days', 'seed-txn-0007'),
  ((SELECT id FROM accounts WHERE bank = 'OCBC 360' AND identifier = '8899'), 'SP SERVICES', 96.30, 'SGD', 96.30, 'SGD', 'Utilities', '4900', NOW() - INTERVAL '8 days', 'seed-txn-0008'),
  ((SELECT id FROM accounts WHERE bank = 'OCBC 360' AND identifier = '8899'), 'ION DEPARTMENT STORE', 128.00, 'SGD', 128.00, 'SGD', 'Shopping', '5311', NOW() - INTERVAL '9 days', 'seed-txn-0009'),
  ((SELECT id FROM accounts WHERE bank = 'Mari CC' AND identifier = '4040'), 'CHALLENGER', 249.00, 'SGD', 249.00, 'SGD', 'Electronics', '5732', NOW() - INTERVAL '10 days', 'seed-txn-0010'),
  ((SELECT id FROM accounts WHERE bank = 'Mari CC' AND identifier = '4040'), 'HOTEL BOOKING', 312.00, 'SGD', 312.00, 'SGD', 'Travel', '7011', NOW() - INTERVAL '11 days', 'seed-txn-0011'),
  ((SELECT id FROM accounts WHERE bank = 'DBS PayLah' AND identifier = '91234567'), 'HAWKER CENTRE', 7.20, 'SGD', 7.20, 'SGD', 'Dining', '5812', NOW() - INTERVAL '12 days', 'seed-txn-0012')
ON CONFLICT (transaction_hash) DO UPDATE SET
  merchant = EXCLUDED.merchant,
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency,
  amount_base_currency = EXCLUDED.amount_base_currency,
  base_currency = EXCLUDED.base_currency,
  category = EXCLUDED.category,
  mcc_code = EXCLUDED.mcc_code,
  transaction_timestamp = EXCLUDED.transaction_timestamp;

COMMIT;

-- Dev seed: only fixtures frozen in docs/03 (wireframe demo data + Croma Confirm split).
-- O2 in docs/03: the other ~22 receipts / $9,210 aggregate are not invented here.

BEGIN;

-- Fixed UUIDs for local demos (not production).
-- Abhi demo user
INSERT INTO users (
  id, auth_kind, display_name, evm_address, sol_address, sol_usdc_ata,
  referral_code, country, created_at
) VALUES (
  '018f0000-0000-7000-8000-000000000001',
  'seed',
  'Abhi',
  '0xAbhi000000000000000000000000000000000001',
  'AbhiSol1111111111111111111111111111111111',
  'AbhiAta1111111111111111111111111111111111',
  'ABHI42',
  'IN',
  '2025-11-01T00:00:00Z'
);

INSERT INTO rules (
  user_id, rate_bps, monthly_cap_usd6, ready_min_usd6, fallback_asset,
  split_maker, split_behind, split_materials, buy_day, max_fee_bps,
  auto_add, onchain_synced_at, updated_at
) VALUES (
  '018f0000-0000-7000-8000-000000000001',
  500,
  50000000,
  5000000,
  'idx:sp500',
  70, 20, 10,
  'sun',
  500,
  '{"ethereum":{"on":false,"capUsd6":"1000000000"},"base":{"on":false,"capUsd6":"1000000000"},"arbitrum":{"on":false,"capUsd6":"1000000000"}}'::jsonb,
  NULL,
  now()
);

-- Wireframe multi-chain free USDC (docs/03): Solana 175.10 · Arc 50.00 · Base 5.20 · Eth 3.90
INSERT INTO deposits (
  id, user_id, chain, tx_hash, from_address, token, amount_usd6, status,
  confirmations, fees_usd6, seen_at, added_at
) VALUES
  ('018f0000-0000-7000-8000-000000000010', '018f0000-0000-7000-8000-000000000001',
   'solana', 'seed_sol_deposit_1', 'external', 'USDC', 175100000, 'added', 1, 0, '2025-11-01T00:00:00Z', '2025-11-01T00:01:00Z'),
  ('018f0000-0000-7000-8000-000000000011', '018f0000-0000-7000-8000-000000000001',
   'arc', 'seed_arc_deposit_1', 'external', 'USDC', 50000000, 'added', 1, 0, '2025-11-01T00:00:00Z', '2025-11-01T00:01:00Z'),
  ('018f0000-0000-7000-8000-000000000012', '018f0000-0000-7000-8000-000000000001',
   'base', 'seed_base_deposit_1', 'external', 'USDC', 5200000, 'added', 12, 0, '2025-11-01T00:00:00Z', '2025-11-01T00:05:00Z'),
  ('018f0000-0000-7000-8000-000000000013', '018f0000-0000-7000-8000-000000000001',
   'ethereum', 'seed_eth_deposit_1', 'external', 'USDC', 3900000, 'added', 12, 0, '2025-11-01T00:00:00Z', '2025-11-01T00:05:00Z');

-- Croma iPhone Confirm (docs/03): invest $47.75 → Apple 33.43 · TSMC 3.18 · Qualcomm 3.18 · Corning 3.19 · Gold 2.39 · Silver 2.38
INSERT INTO purchases (
  id, user_id, source, status, shop, place, items, purchased_on,
  amount_local, currency, fx_rate, fx_source, fx_date, amount_usd6,
  rate_bps, invest_usd6, split, rest_usd6, created_at, updated_at
) VALUES (
  '018f0000-0000-7000-8000-000000000020',
  '018f0000-0000-7000-8000-000000000001',
  'photo',
  'ready',
  'Croma',
  'Mumbai',
  '[{"name":"iPhone 17 256 GB","brand":"Apple","qty":1}]'::jsonb,
  '2025-11-05',
  79900.00,
  'INR',
  83.66000000,
  'frankfurter',
  '2025-11-05',
  955000000,
  500,
  47750000,
  '{"maker":70,"behind":20,"materials":10}'::jsonb,
  0,
  '2025-11-05T12:00:00Z',
  '2025-11-05T12:00:00Z'
);

INSERT INTO allocations (id, purchase_id, asset_id, role, amount_usd6, selected, why) VALUES
  ('018f0000-0000-7000-8000-000000000021', '018f0000-0000-7000-8000-000000000020', 'co:apple',     'maker',    33430000, true, 'Makes the iPhone'),
  ('018f0000-0000-7000-8000-000000000022', '018f0000-0000-7000-8000-000000000020', 'co:tsmc',      'supplier',  3180000, true, 'Makes the A19 chip'),
  ('018f0000-0000-7000-8000-000000000023', '018f0000-0000-7000-8000-000000000020', 'co:qualcomm',  'supplier',  3180000, true, '5G modem'),
  ('018f0000-0000-7000-8000-000000000024', '018f0000-0000-7000-8000-000000000020', 'co:corning',   'supplier',  3190000, true, 'Cover glass'),
  ('018f0000-0000-7000-8000-000000000025', '018f0000-0000-7000-8000-000000000020', 'mat:gold',     'material',  2390000, true, 'Circuit board contacts'),
  ('018f0000-0000-7000-8000-000000000026', '018f0000-0000-7000-8000-000000000020', 'mat:silver',   'material',  2380000, true, 'Solder and contacts');

-- FX cache row used by the Croma purchase
INSERT INTO fx_rates (date, currency, rate, source, fetched_at) VALUES
  ('2025-11-05', 'INR', 83.66000000, 'frankfurter', '2025-11-05T00:00:00Z');

COMMIT;

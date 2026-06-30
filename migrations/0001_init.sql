CREATE TABLE IF NOT EXISTS points (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  price_per_towel INTEGER NOT NULL,
  clean_on_shelf INTEGER NOT NULL,
  employees_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS customers (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  name TEXT,
  code TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  telegram_chat_id TEXT,
  telegram_user_id TEXT,
  telegram_linked_at TEXT,
  chat_id TEXT,
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_verifications_code_status ON verifications (code, status);
CREATE INDEX IF NOT EXISTS idx_verifications_phone_status ON verifications (phone, status);
CREATE INDEX IF NOT EXISTS idx_verifications_chat_status ON verifications (telegram_chat_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  point_id TEXT NOT NULL,
  point_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  towel_count INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  payment_created_at TEXT NOT NULL,
  paid_at TEXT,
  issued_at TEXT,
  returned_at TEXT,
  payment_redirect_url TEXT,
  freedom_payment_id TEXT,
  freedom_pay_created_at TEXT,
  payment_error TEXT,
  freedom_result_json TEXT,
  freedom_result_response_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_point_id ON orders (point_id);

INSERT OR IGNORE INTO points (
  id, code, name, city, address, price_per_towel, clean_on_shelf, employees_json
) VALUES
  ('mega-aqua', 'QR-MEGA-AQUA', 'Mega Aqua Spa', 'Алматы', 'пр. Розыбакиева, 247А', 900, 46, '["Айдана","Руслан"]'),
  ('central-pool', 'QR-CENTRAL-POOL', 'Central Pool', 'Астана', 'ул. Кабанбай батыра, 12', 800, 32, '["Мадина","Тимур"]'),
  ('family-sauna', 'QR-FAMILY-SAUNA', 'Family Sauna', 'Шымкент', 'ул. Байтурсынова, 44', 700, 58, '["Аружан"]');

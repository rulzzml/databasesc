-- Buat tabel users untuk sistem login
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT,
    provider TEXT DEFAULT 'local',
    provider_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
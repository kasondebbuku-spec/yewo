import { DatabaseSync } from 'node:sqlite';

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('customer','worker','admin')),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  pin_hash    TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agencies (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  phone  TEXT,
  area   TEXT
);

CREATE TABLE IF NOT EXISTS zones (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  radius_km  REAL NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  base_price  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  user_id              INTEGER PRIMARY KEY REFERENCES users(id),
  nrc                  TEXT NOT NULL UNIQUE,
  agency_id            INTEGER NOT NULL REFERENCES agencies(id),
  verification_status  TEXT NOT NULL DEFAULT 'pending'
                         CHECK (verification_status IN ('pending','verified','rejected')),
  verification_note    TEXT,
  verified_at          TEXT,
  skills               TEXT NOT NULL DEFAULT '[]',  -- JSON array of service ids
  is_online            INTEGER NOT NULL DEFAULT 0,
  lat                  REAL,
  lng                  REAL,
  location_at          TEXT,
  rating_avg           REAL NOT NULL DEFAULT 0,
  rating_count         INTEGER NOT NULL DEFAULT 0,
  jobs_completed       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
  id              INTEGER PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES users(id),
  worker_id       INTEGER REFERENCES users(id),
  service_id      INTEGER NOT NULL REFERENCES services(id),
  zone_id         INTEGER NOT NULL REFERENCES zones(id),
  address         TEXT NOT NULL,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  notes           TEXT,
  urgent          INTEGER NOT NULL DEFAULT 0,
  price           REAL NOT NULL,   -- service price
  urgency_fee     REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL,   -- what the customer pays
  commission      REAL NOT NULL,   -- Yewo's cut
  worker_payout   REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'searching'
                    CHECK (status IN ('searching','accepted','en_route','in_progress',
                                      'completed','cancelled','no_workers')),
  payment_status  TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid','pending','paid','failed')),
  dispatch_wave   INTEGER NOT NULL DEFAULT 0,
  check_in_distance_m REAL,
  created_at      TEXT NOT NULL,
  accepted_at     TEXT,
  en_route_at     TEXT,
  checked_in_at   TEXT,
  completed_at    TEXT,
  cancelled_at    TEXT,
  cancel_reason   TEXT
);

CREATE TABLE IF NOT EXISTS job_offers (
  job_id      INTEGER NOT NULL REFERENCES jobs(id),
  worker_id   INTEGER NOT NULL REFERENCES users(id),
  wave        INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'offered'
                CHECK (status IN ('offered','accepted','declined','expired')),
  offered_at  TEXT NOT NULL,
  PRIMARY KEY (job_id, worker_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id          INTEGER PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id),
  provider    TEXT NOT NULL CHECK (provider IN ('mtn','airtel')),
  phone       TEXT NOT NULL,
  amount      REAL NOT NULL,
  reference   TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  job_id      INTEGER NOT NULL REFERENCES jobs(id),
  from_user   INTEGER NOT NULL REFERENCES users(id),
  to_user     INTEGER NOT NULL REFERENCES users(id),
  stars       INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (job_id, from_user)
);

CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_worker   ON jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_offers_worker ON job_offers(worker_id, status);
`;

export function initDb(file) {
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialised. Call initDb() first.');
  return db;
}

// Run several statements as one all-or-nothing unit.
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export const now = () => new Date().toISOString();

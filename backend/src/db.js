import { DatabaseSync } from 'node:sqlite';

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  role        TEXT NOT NULL CHECK (role IN ('customer','worker','admin','agency')),
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
  jobs_completed       INTEGER NOT NULL DEFAULT 0,
  agency_confirmed_at  TEXT     -- the agency confirmed this person works for them
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
                    CHECK (status IN ('scheduled','searching','accepted','en_route','in_progress',
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
  cancel_reason   TEXT,
  scheduled_for   TEXT,            -- set when booked for later
  payout_id       INTEGER REFERENCES payouts(id)
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

-- One-time SMS codes (only a hash of the code is stored)
CREATE TABLE IF NOT EXISTS otp_codes (
  id          INTEGER PRIMARY KEY,
  phone       TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('register','reset_pin')),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

-- NRC front, NRC back and a selfie for each worker
CREATE TABLE IF NOT EXISTS worker_documents (
  id          INTEGER PRIMARY KEY,
  worker_id   INTEGER NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('nrc_front','nrc_back','selfie')),
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (worker_id, kind)
);

-- Expo push tokens (one person can have several phones)
CREATE TABLE IF NOT EXISTS push_tokens (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  platform    TEXT,
  updated_at  TEXT NOT NULL
);

-- Staff logins for partner agencies (the agency portal)
CREATE TABLE IF NOT EXISTS agency_staff (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  agency_id   INTEGER NOT NULL REFERENCES agencies(id)
);

-- Problems reported on a job, including emergencies
CREATE TABLE IF NOT EXISTS incidents (
  id           INTEGER PRIMARY KEY,
  job_id       INTEGER NOT NULL REFERENCES jobs(id),
  reporter_id  INTEGER NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL,
  description  TEXT,
  lat          REAL,
  lng          REAL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  resolution   TEXT,
  resolved_by  INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

-- Weekly money owed to each worker for paid jobs
CREATE TABLE IF NOT EXISTS payouts (
  id            INTEGER PRIMARY KEY,
  worker_id     INTEGER NOT NULL REFERENCES users(id),
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  jobs          INTEGER NOT NULL,
  amount        REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  reference     TEXT,
  created_at    TEXT NOT NULL,
  paid_at       TEXT,
  UNIQUE (worker_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_job ON incidents(job_id);
CREATE INDEX IF NOT EXISTS idx_payouts_worker ON payouts(worker_id);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, purpose);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_worker   ON jobs(worker_id);
CREATE INDEX IF NOT EXISTS idx_offers_worker ON job_offers(worker_id, status);
`;

export function initDb(file) {
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

// ---- Migrations ----------------------------------------------------------------
// PRAGMA user_version records which version of the schema a database file has.
// v1: first release. v2: agency logins, scheduled bookings, reports, payouts.
const SCHEMA_VERSION = 2;

function migrate(d) {
  const version = d.prepare('PRAGMA user_version').get().user_version;
  const existing = d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();

  if (existing && version < 2) {
    // SQLite can't change a CHECK rule in place, so rebuild these two tables and keep their rows.
    d.exec('PRAGMA foreign_keys = OFF');
    try {
      transaction(() => {
        rebuildTable(d, 'users');
        rebuildTable(d, 'workers');
        rebuildTable(d, 'jobs');
      });
    } finally {
      d.exec('PRAGMA foreign_keys = ON');
    }
  }

  d.exec(SCHEMA); // creates anything still missing (new tables, indexes)
  d.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

function tableSql(name) {
  const match = SCHEMA.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`));
  if (!match) throw new Error(`No definition for table ${name}`);
  return match[0];
}

function rebuildTable(d, name) {
  const columns = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  d.exec(tableSql(name).replace(`CREATE TABLE IF NOT EXISTS ${name}`, `CREATE TABLE ${name}__new`));
  const old = new Set(columns(name));
  const shared = columns(`${name}__new`).filter((c) => old.has(c)).join(', ');
  d.exec(`INSERT INTO ${name}__new (${shared}) SELECT ${shared} FROM ${name};
          DROP TABLE ${name};
          ALTER TABLE ${name}__new RENAME TO ${name};`);
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

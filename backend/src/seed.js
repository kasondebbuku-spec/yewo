// Reference data (zones, services, agencies) is added automatically on first start.
// Demo accounts are added with:  npm run seed
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { getDb, initDb, now, transaction } from './db.js';

// Approximate centres of Lusaka neighbourhoods. Pilot zones are active; others show "coming soon".
const ZONES = [
  { name: 'Kabulonga', lat: -15.417, lng: 28.341, radius_km: 2.0, active: 1 },
  { name: 'Woodlands', lat: -15.439, lng: 28.318, radius_km: 2.0, active: 1 },
  { name: 'Ibex Hill', lat: -15.442, lng: 28.37, radius_km: 2.0, active: 0 },
  { name: 'Rhodes Park', lat: -15.408, lng: 28.305, radius_km: 1.5, active: 0 },
  { name: 'Roma', lat: -15.376, lng: 28.32, radius_km: 2.0, active: 0 },
];

const SERVICES = [
  { name: 'Home cleaning', description: 'Sweeping, mopping, dusting, kitchen and bathrooms', base_price: 200 },
  { name: 'Laundry & ironing', description: 'Washing, drying and ironing clothes', base_price: 150 },
  { name: 'General labour', description: 'Moving, lifting, yard clean-up and odd jobs', base_price: 180 },
  { name: 'Gardening', description: 'Lawn, weeding, trimming and watering', base_price: 170 },
  { name: 'Deep cleaning', description: 'Full top-to-bottom clean, move-in/move-out', base_price: 350 },
];

// Demo agencies (fictional names, replace with your real partner agencies).
const AGENCIES = [
  { name: 'Kabulonga Domestic Services', phone: '0961000001', area: 'Kabulonga' },
  { name: 'Woodlands Home Care', phone: '0971000002', area: 'Woodlands' },
  { name: 'Lusaka Trusted Helpers', phone: '0761000003', area: 'Lusaka' },
];

export function seedCatalog() {
  const db = getDb();
  const empty = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n === 0;
  transaction((d) => {
    if (empty('zones')) {
      const q = d.prepare('INSERT INTO zones (name, lat, lng, radius_km, active) VALUES (?, ?, ?, ?, ?)');
      for (const z of ZONES) q.run(z.name, z.lat, z.lng, z.radius_km, z.active);
    }
    if (empty('services')) {
      const q = d.prepare('INSERT INTO services (name, description, base_price) VALUES (?, ?, ?)');
      for (const s of SERVICES) q.run(s.name, s.description, s.base_price);
    }
    if (empty('agencies')) {
      const q = d.prepare('INSERT INTO agencies (name, phone, area) VALUES (?, ?, ?)');
      for (const a of AGENCIES) q.run(a.name, a.phone, a.area);
    }
  });
}

// Demo logins. Every demo account uses PIN 1234.
export const DEMO_PIN = '1234';
export const DEMO_USERS = [
  { role: 'admin', name: 'Yewo Admin', phone: '0960000001' },
  { role: 'customer', name: 'Chanda Mwila', phone: '0971111111' },
  { role: 'agency', name: 'Bwalya Mulenga', phone: '0960000002', agency: 1 }, // manager at Kabulonga Domestic Services
  {
    role: 'worker', name: 'Mary Banda', phone: '0962222221', nrc: '123456/10/1', agency: 1,
    skills: [1, 2, 3], status: 'verified', online: 1, lat: -15.412, lng: 28.336, rating: [4.8, 23], done: 23,
  },
  {
    role: 'worker', name: 'Grace Phiri', phone: '0972222222', nrc: '234567/11/1', agency: 1,
    skills: [1, 2, 5], status: 'verified', online: 1, lat: -15.421, lng: 28.348, rating: [4.6, 11], done: 11,
  },
  {
    role: 'worker', name: 'Joseph Tembo', phone: '0962222223', nrc: '345678/12/1', agency: 2,
    skills: [3, 4], status: 'verified', online: 1, lat: -15.436, lng: 28.321, rating: [4.9, 8], done: 8,
  },
  {
    role: 'worker', name: 'Ruth Zulu', phone: '0772222224', nrc: '456789/13/1', agency: 3,
    skills: [1, 2], status: 'pending', online: 0,
  },
];

export function seedDemo() {
  const pinHash = bcrypt.hashSync(DEMO_PIN, 10);
  transaction((d) => {
    for (const u of DEMO_USERS) {
      if (d.prepare('SELECT 1 FROM users WHERE phone = ?').get(u.phone)) continue;
      const id = Number(
        d.prepare('INSERT INTO users (role, name, phone, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(u.role, u.name, u.phone, pinHash, now()).lastInsertRowid
      );
      if (u.role === 'agency') {
        d.prepare('INSERT INTO agency_staff (user_id, agency_id) VALUES (?, ?)').run(id, u.agency);
        continue;
      }
      if (u.role !== 'worker') continue;
      d.prepare(
        `INSERT INTO workers (user_id, nrc, agency_id, verification_status, verified_at, skills,
                              is_online, lat, lng, location_at, rating_avg, rating_count, jobs_completed,
                              agency_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, u.nrc, u.agency, u.status, u.status === 'verified' ? now() : null, JSON.stringify(u.skills),
        u.online, u.lat ?? null, u.lng ?? null, u.lat ? now() : null,
        u.rating?.[0] ?? 0, u.rating?.[1] ?? 0, u.done ?? 0, u.status === 'verified' ? now() : null
      );
    }
  });
}

// `npm run seed`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  initDb(config.dbFile);
  seedCatalog();
  seedDemo();
  console.log(`Seeded ${config.dbFile}. Demo accounts (PIN ${DEMO_PIN}):`);
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(8)} ${u.phone}  ${u.name}`);
}

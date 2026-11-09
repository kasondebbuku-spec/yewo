// Worker identity photos: NRC front, NRC back and a selfie.
// Files are stored outside the web root and only reachable through short-lived signed links.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getDb, now } from './db.js';
import { badRequest } from './errors.js';

export const DOCUMENT_KINDS = ['nrc_front', 'nrc_back', 'selfie'];
export const DOCUMENT_LABELS = { nrc_front: 'NRC front', nrc_back: 'NRC back', selfie: 'Selfie' };

// Check the file really is an image by its first bytes, not by what the phone claims.
function detectImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  const brand = buf.length > 12 ? buf.toString('ascii', 4, 12) : '';
  if (/^ftyp(heic|heix|mif1|msf1)/.test(brand)) return { mime: 'image/heic', ext: 'heic' };
  return null;
}

const dir = () => {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  return config.uploadDir;
};

export function saveDocument(workerId, kind, buffer) {
  if (!DOCUMENT_KINDS.includes(kind)) throw badRequest('Unknown photo type');
  if (!buffer?.length) throw badRequest('Choose a photo to upload');
  const type = detectImageType(buffer);
  if (!type) throw badRequest('Please upload a photo (JPG, PNG, WEBP or HEIC)');

  const db = getDb();
  const filename = `${workerId}-${kind}-${randomUUID()}.${type.ext}`;
  fs.writeFileSync(path.join(dir(), filename), buffer);

  const old = db.prepare('SELECT filename FROM worker_documents WHERE worker_id = ? AND kind = ?').get(workerId, kind);
  db.prepare(
    `INSERT INTO worker_documents (worker_id, kind, filename, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(worker_id, kind) DO UPDATE SET filename = excluded.filename, mime = excluded.mime,
                                                size = excluded.size, created_at = excluded.created_at`
  ).run(workerId, kind, filename, type.mime, buffer.length, now());
  if (old) fs.rm(path.join(dir(), old.filename), { force: true }, () => {});

  // A rejected worker who sends new photos goes back into the review queue.
  db.prepare(
    "UPDATE workers SET verification_status = 'pending', verification_note = NULL WHERE user_id = ? AND verification_status = 'rejected'"
  ).run(workerId);
}

// The worker's photos, each with a link valid for 15 minutes.
export function listDocuments(workerId, baseUrl) {
  const rows = getDb()
    .prepare('SELECT id, kind, created_at FROM worker_documents WHERE worker_id = ?')
    .all(workerId);
  return DOCUMENT_KINDS.map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    if (!row) return { kind, label: DOCUMENT_LABELS[kind], uploaded: false, url: null };
    const sig = jwt.sign({ fid: row.id, typ: 'file' }, config.jwtSecret, { expiresIn: '15m' });
    return {
      kind,
      label: DOCUMENT_LABELS[kind],
      uploaded: true,
      uploadedAt: row.created_at,
      url: `${baseUrl}/files/${row.id}?sig=${sig}`,
    };
  });
}

export const hasAllDocuments = (workerId) =>
  getDb().prepare('SELECT COUNT(*) AS n FROM worker_documents WHERE worker_id = ?').get(workerId).n ===
  DOCUMENT_KINDS.length;

// Returns { file path, mime } if the signed link is valid, else null.
export function resolveSignedFile(id, sig) {
  try {
    const p = jwt.verify(String(sig ?? ''), config.jwtSecret);
    if (p.typ !== 'file' || p.fid !== Number(id)) return null;
  } catch {
    return null;
  }
  const row = getDb().prepare('SELECT filename, mime FROM worker_documents WHERE id = ?').get(Number(id));
  return row ? { file: path.resolve(dir(), row.filename), mime: row.mime } : null;
}

import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getDb } from './db.js';
import { forbidden, unauthorized } from './errors.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });

export const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

// Express middleware. requireAuth() = any logged-in user, requireAuth('worker') = workers only.
export function requireAuth(...roles) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw unauthorized('Your session has expired, please log in again');
    }
    // Only login tokens count here (not SMS phone tokens or file links).
    if (payload.typ || !payload.sub) throw unauthorized();

    const user = getDb()
      .prepare('SELECT id, role, name, phone FROM users WHERE id = ?')
      .get(payload.sub);
    if (!user) throw unauthorized();
    if (roles.length && !roles.includes(user.role)) throw forbidden();

    req.user = user;
    next();
  };
}

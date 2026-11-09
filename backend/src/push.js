// Push notifications through Expo's push service (works for Android and iOS builds).
// Best effort: a failed push never breaks the request that triggered it.
import { config } from './config.js';
import { getDb, now } from './db.js';
import { badRequest } from './errors.js';

export const sentPushes = []; // filled when PUSH_PROVIDER=memory (tests)

export function savePushToken(userId, token, platform) {
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(String(token ?? ''))) throw badRequest('Invalid push token');
  getDb()
    .prepare(
      `INSERT INTO push_tokens (token, user_id, platform, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
                                        updated_at = excluded.updated_at`
    )
    .run(token, userId, platform ? String(platform).slice(0, 20) : null, now());
}

export function removePushToken(userId, token) {
  getDb().prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(String(token ?? ''), userId);
}

// title/body are what the person sees; data.url is the screen to open when tapped.
export function pushToUser(userId, { title, body, data = {} }) {
  if (config.pushProvider === 'off') return;
  const tokens = getDb().prepare('SELECT token FROM push_tokens WHERE user_id = ?').all(userId).map((r) => r.token);
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to, title, body, data, sound: 'default', priority: 'high', channelId: 'jobs',
  }));

  if (config.pushProvider === 'memory') {
    sentPushes.push(...messages.map((m) => ({ ...m, userId })));
    return;
  }
  sendToExpo(messages).catch((err) => console.error('Push failed:', err.message));
}

async function sendToExpo(messages) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(config.expoAccessToken ? { authorization: `Bearer ${config.expoAccessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => ({}));
  // Forget phones that uninstalled the app or turned notifications off.
  (result.data ?? []).forEach((ticket, i) => {
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      getDb().prepare('DELETE FROM push_tokens WHERE token = ?').run(messages[i].to);
    }
  });
}

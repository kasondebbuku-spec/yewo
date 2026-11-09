// Sending SMS. Africa's Talking covers Zambian networks (MTN, Airtel, Zamtel).
// In development the "console" provider just prints the message in the server terminal.
import { config } from './config.js';

const toInternational = (localPhone) => '+260' + localPhone.slice(1); // 0971234567 -> +260971234567

const providers = {
  console: async (phone, message) => {
    console.log(`[SMS to ${phone}] ${message}`);
  },

  africastalking: async (phone, message) => {
    const { username, apiKey, senderId } = config.africasTalking;
    if (!apiKey) throw new Error('AT_API_KEY is not set');
    const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username, to: toInternational(phone), message });
    if (senderId) body.set('from', senderId);

    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    const status = data?.SMSMessageData?.Recipients?.[0]?.status;
    if (!res.ok || status !== 'Success') {
      throw new Error(`Africa's Talking error: ${status || res.status}`);
    }
  },
};

export async function sendSms(phone, message) {
  const send = providers[config.smsProvider];
  if (!send) throw new Error(`Unknown SMS_PROVIDER "${config.smsProvider}"`);
  await send(phone, message);
}

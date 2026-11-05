import { badRequest } from './errors.js';

// Zambian mobile numbers: 095/075 Zamtel, 096/076 MTN, 097/077 Airtel.
// Accepts "0971234567", "+260971234567", "260 97 123 4567". Returns "0971234567".
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  let local = digits;
  if (digits.startsWith('260') && digits.length === 12) local = '0' + digits.slice(3);
  if (!/^0[79][5-7]\d{7}$/.test(local)) {
    throw badRequest('Enter a valid Zambian mobile number, e.g. 0971234567');
  }
  return local;
}

export function mobileNetwork(phone) {
  return { 5: 'zamtel', 6: 'mtn', 7: 'airtel' }[phone[2]];
}

// NRC format: 123456/78/1
export function validateNrc(input) {
  const nrc = String(input ?? '').trim();
  if (!/^\d{6}\/\d{2}\/\d$/.test(nrc)) {
    throw badRequest('NRC must look like 123456/78/1');
  }
  return nrc;
}

export function maskNrc(nrc) {
  return '******' + nrc.slice(6);
}

export function validatePin(pin) {
  if (!/^\d{4,6}$/.test(String(pin ?? ''))) throw badRequest('PIN must be 4 to 6 digits');
  return String(pin);
}

export function requireText(value, field, max = 200) {
  const text = String(value ?? '').trim();
  if (!text) throw badRequest(`${field} is required`);
  if (text.length > max) throw badRequest(`${field} is too long`);
  return text;
}

export function requireCoords(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(ln) ||
      Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw badRequest('A valid location (lat, lng) is required');
  }
  return { lat: la, lng: ln };
}

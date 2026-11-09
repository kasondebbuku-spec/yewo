// Central settings. Override any value with an environment variable.
const num = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);

export const config = {
  port: num('PORT', 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dbFile: process.env.DB_FILE || 'yewo.db',

  // Business rules
  commissionRate: 0.15, // Yewo keeps 15% of each completed booking
  urgencyFee: 30, // Kwacha added to "urgent" requests

  // Dispatch: offer a job to a few nearby workers at a time, widen if nobody accepts
  offerBatchSize: num('OFFER_BATCH_SIZE', 3),
  offerTimeoutMs: num('OFFER_TIMEOUT_MS', 45_000),
  maxWaves: num('MAX_WAVES', 3),
  maxDispatchKm: num('MAX_DISPATCH_KM', 6),

  // Worker must be this close to the job address to check in
  checkInRadiusM: num('CHECKIN_RADIUS_M', 300),

  // Lusaka is UTC+2 all year (no daylight saving). Used for opening hours and payout weeks.
  timezoneOffsetMinutes: 120,

  // Booking ahead
  scheduling: {
    minLeadMinutes: 60, // earliest "later" booking is an hour from now
    maxDaysAhead: 14,
    openHour: 7, // jobs can start from 07:00…
    lastStartHour: 17, // …until 17:00 (Lusaka time)
    dispatchLeadMinutes: 45, // start finding a worker this long before the booked time
    maxPerCustomer: 3,
    checkEveryMs: num('SCHEDULER_INTERVAL_MS', 30_000),
  },

  // Reports can be made up to this many days after a job ends
  reportWindowDays: 7,

  // Shown on the emergency screen. Confirm these with Zambia Police before launch.
  emergencyNumbers: [
    { label: 'Emergency', number: '999' },
    { label: 'Police', number: '991' },
    { label: 'Ambulance', number: '992' },
    { label: 'Fire', number: '993' },
  ],

  // Fake MoMo: how long before a payment request "succeeds"
  mockPaymentDelayMs: num('MOCK_PAYMENT_DELAY_MS', 3000),

  // SMS codes. "console" prints codes in the server terminal (development).
  // "africastalking" sends real SMS: set AT_USERNAME, AT_API_KEY and optionally AT_SENDER_ID.
  smsProvider: process.env.SMS_PROVIDER || 'console',
  africasTalking: {
    username: process.env.AT_USERNAME || 'sandbox',
    apiKey: process.env.AT_API_KEY || '',
    senderId: process.env.AT_SENDER_ID || '',
  },
  otpTtlMs: 10 * 60 * 1000,
  isProduction: process.env.NODE_ENV === 'production',

  // NRC photos
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: 5 * 1024 * 1024,

  // Push notifications through Expo's push service. "memory" keeps them in a list (tests),
  // "off" disables them. EXPO_ACCESS_TOKEN is optional (only if you enable push security).
  pushProvider: process.env.PUSH_PROVIDER || 'expo',
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
};

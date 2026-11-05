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

  // Fake MoMo: how long before a payment request "succeeds"
  mockPaymentDelayMs: num('MOCK_PAYMENT_DELAY_MS', 3000),
};

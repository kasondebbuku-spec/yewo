# Yewo: verified home services for Lusaka

Customers book cleaning, laundry, gardening or general labour. The request goes to the
nearest **NRC-verified, agency-registered** workers who are online. The first to accept gets the job.
The customer follows the worker live, the worker checks in at the address and checks out
when done, the customer pays with **MTN or Airtel Mobile Money**, and both sides rate each other.

```
yewo/
├── backend/   Node.js + Express API, Socket.IO live updates, SQLite (built into Node)
└── mobile/    Expo (React Native) app: Android, iOS and web, one codebase
```

## Run it

You need Node.js 22.13 or newer. Open two terminals.

**1. API** (http://localhost:4000)

```bash
cd backend
npm install
npm run seed      # creates yewo.db with zones, services, agencies and demo accounts
npm run dev
```

**2. App**

```bash
cd mobile
npm install
npm run web       # opens in the browser; or `npm start` and scan the QR code with Expo Go
```

On a real phone with Expo Go, the app finds the API on the same computer automatically
(phone and computer must be on the same Wi-Fi). To point it somewhere else, create
`mobile/.env` with `EXPO_PUBLIC_API_URL=http://<your-ip>:4000`.

### Demo accounts (PIN 1234)

| Role     | Phone      | Name |
|----------|------------|------|
| Customer | 0971111111 | Chanda Mwila |
| Worker   | 0962222221 | Mary Banda (cleaning, laundry, labour) |
| Worker   | 0972222222 | Grace Phiri (cleaning, laundry, deep cleaning) |
| Worker   | 0962222223 | Joseph Tembo (labour, gardening) |
| Worker   | 0772222224 | Ruth Zulu (*pending verification*) |
| Admin    | 0960000001 | Yewo Admin |

The login screen has buttons that fill these in (development builds only).

**Try the full loop:** log in as the customer in one browser window and as Mary in a private
window. Book "Home cleaning", accept it as Mary, tap "I'm on my way" (the customer sees the ETA
drop), check in, check out, then pay and rate as the customer.

### Demo mode

`EXPO_PUBLIC_DEMO_LOCATION` is on by default: everyone is placed in Kabulonga, and the worker
"drives" to the customer when on the way, so you can demo from anywhere. For real GPS, put
`EXPO_PUBLIC_DEMO_LOCATION=false` in `mobile/.env`.

## How it works

**Zones.** Kabulonga and Woodlands are live pilot zones (2 km circles). Ibex Hill, Rhodes Park
and Roma are listed as "coming soon". Edit them in [`backend/src/seed.js`](backend/src/seed.js).

**Dispatch** ([`backend/src/dispatch.js`](backend/src/dispatch.js)). Each request goes to the
3 closest verified, online, free workers with the right skill, within 6 km. If nobody accepts in
45 seconds (or everyone declines), the next 3 get it. After 3 rounds the customer sees
"no one available" and can retry. All of these numbers are in
[`backend/src/config.js`](backend/src/config.js).

**Trust and safety.**
- Workers register with an NRC (format `123456/78/1`) and their agency. They can't go online until an admin approves them.
- Customers see the worker's name, agency, masked NRC, rating and jobs done, and can call the worker or the agency.
- Workers don't see the exact address or customer phone until they accept.
- Check-in only works within 300 m of the address, and the distance is saved.
- 5 wrong PINs locks a number for 15 minutes.

**Money.** Price + optional K30 urgency fee. Yewo keeps 15%; the worker sees their payout
before accepting. The admin screen shows paid bookings value, commission and average time to accept.

## Status

| Done | Not yet |
|------|---------|
| Sign-up/login (phone + PIN) for customers and workers | SMS OTP to confirm phone numbers |
| Worker NRC + agency verification by admin | NRC photo upload |
| Zone detection, wave dispatch, accept/decline/drop job | Push notifications when the app is closed |
| Live worker location and ETA | Map view |
| GPS check-in/check-out | Scheduled (later-today) bookings |
| Mobile Money flow (**mocked**) | Real MTN MoMo / Airtel Money APIs |
| Two-way ratings, earnings, admin stats | Worker payouts, disputes, SOS button |
| SQLite database | PostgreSQL for production |

**Mock payments:** a payment "succeeds" after 3 seconds. Numbers ending in `0000` always fail,
so you can test the retry screen. To go live, add MTN and Airtel providers in
[`backend/src/payments/index.js`](backend/src/payments/index.js). The flow (request to pay, then
a callback) already matches how both providers work.

## Tests

```bash
cd backend && npm test     # 11 end-to-end tests: full booking loop, dispatch waves, payments, verification
cd mobile && npm run typecheck
```

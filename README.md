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

## Run it online

The API is set up to run on Railway with a volume for the database and photos. Step by step: [DEPLOY.md](DEPLOY.md).

## Run it on your computer

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
| Agency   | 0960000002 | Bwalya Mulenga, manager at Kabulonga Domestic Services (Mary and Grace) |

The login screen has buttons that fill these in (development builds only).

**Try the full loop:** log in as the customer in one browser window and as Mary in a private
window. Book "Home cleaning", accept it as Mary, tap "I'm on my way" (the customer sees the ETA
drop), check in, check out, then pay and rate as the customer.

### Real GPS, maps and demo mode

The app uses the phone's **real GPS** by default:
- **Booking:** a map opens at your location. Drag it so the pin sits on your gate. The active zones are shaded, and the
  button stays off until the pin is inside one. The address fills in from the map (edit it and add a landmark).
- **Tracking:** once a worker accepts, the customer sees a live map with the worker moving toward the house.
  The worker sees the job on a map and has a Directions button.
- **Worker online:** while online, the worker's position updates as they move, so dispatch always uses where they really are.

**Demo location switch** (development builds only, on the login and home screens): when on,
everyone is placed in Kabulonga and the worker "drives" to the customer when on the way. Use it to
demo from anywhere, or when you're testing outside the pilot zones.

Maps use `react-native-maps` (Google Maps on Android). Expo Go needs no setup. A Play Store build will
need a Google Maps API key in `app.json` (see the Expo "MapView" docs). The web version shows coordinates
in place of the map.

## How it works

**Zones.** Kabulonga and Woodlands are live pilot zones (2 km circles). Ibex Hill, Rhodes Park
and Roma are listed as "coming soon". Staff switch zones on or off, resize them, or add new
neighbourhoods from **Admin → Zones**. New zones start switched off.

**Dispatch** ([`backend/src/dispatch.js`](backend/src/dispatch.js)). Each request goes to the
3 closest verified, online, free workers with the right skill, within 6 km. If nobody accepts in
45 seconds (or everyone declines), the next 3 get it. After 3 rounds the customer sees
"no one available" and can retry. All of these numbers are in
[`backend/src/config.js`](backend/src/config.js).

**Trust and safety.**
- Every phone number is confirmed with a 6-digit SMS code at sign-up. Forgot your PIN? Reset it with an SMS code.
- Workers register with an NRC (format `123456/78/1`) and their agency, then photograph the NRC (front and back) and take a selfie.
  An admin compares them and approves or rejects with a reason. Workers can't go online until approved.
- NRC photos are stored privately on the server and only shown through links that expire after 15 minutes.
- Customers see the worker's name, agency, masked NRC, rating and jobs done, and can call the worker or the agency.
- Workers don't see the exact address or customer phone until they accept.
- Check-in only works within 300 m of the address, and the distance is saved.
- 5 wrong PINs locks a number for 15 minutes.

**Money.** Price + optional K30 urgency fee. Yewo keeps 15%; the worker sees their payout
before accepting. The admin screen shows paid bookings value, commission and average time to accept.

## Booking ahead, reports, payouts and the agency portal

**Booking ahead.** Customers choose **Now** or **Book for later**: any hour from 07:00 to 17:00
(Lusaka time), at least an hour ahead and up to 14 days out. The booking waits as "Booked ahead".
45 minutes before the time, the server starts finding a worker in the usual way, and the customer
gets a notification. A customer can book more help for later while a job is under way. The urgency
fee only applies to "now" bookings.

**Reports and the emergency button.** Once a worker has taken a job, both sides can **Report a problem**
(worker didn't arrive, customer wasn't there, job not done properly, damage, payment, unsafe
behaviour, other). The app only offers the kinds that fit that stage of the job, up to 7 days after it
ends. While a job is under way, both sides also see a red **🚨 Emergency** button. After a confirm
tap, it alerts every Yewo admin and the worker's agency at once with the location, and shows one-tap
calls to 999 / 991 police / 992 ambulance / 993 fire. **Confirm these numbers with Zambia Police
before launch**; sources disagree on some of them, and they are in
[`backend/src/config.js`](backend/src/config.js). Staff work through reports in **Admin → Reports**
(urgent first), call either side, and close each report with a note the reporter sees.

**Weekly payouts.** Every Monday, staff tap **Admin → Payouts → Work out last week's payouts**.
This groups each worker's paid jobs from the previous week (Monday to Sunday, Lusaka time). Staff
send each amount from Yewo's Mobile Money account and enter the transaction reference. The worker
gets a notification and sees it under **Payouts to my Mobile Money**, along with what is waiting for
the next payout day. Jobs paid late roll into the next week. Running it twice never pays twice.

**Agency portal.** Partner agencies log in (role `agency`) to see their workers (online, rating,
verification), recent jobs and earnings, and any reports involving their workers. Urgent reports
and emergencies reach them as a notification too. When someone signs up saying they work for the
agency, the agency taps **Yes, they work for us**, and the admin sees "✓ Agency confirmed" before
approving. Agency logins are created by Yewo (see `seedDemo` in [`backend/src/seed.js`](backend/src/seed.js)).

**Database upgrades.** Your existing `yewo.db` upgrades itself on start and keeps all its data
(schema version 2). Run `npm run seed` once to add the demo agency login.

## SMS, NRC photos and push notifications

**SMS codes.** In development, codes are printed in the API terminal and shown in the app
("Development: the code is …"), so no SMS is sent. To send real SMS in Zambia, create an
[Africa's Talking](https://africastalking.com) account and start the API with:

```bash
SMS_PROVIDER=africastalking AT_USERNAME=your_username AT_API_KEY=your_key npm run dev
```

Use `AT_USERNAME=sandbox` with your sandbox key to test with their simulator first. Limits: one code
per minute and five per hour for each number; a code expires after 10 minutes or 5 wrong tries.

**NRC photos.** Saved in `backend/uploads/` (not in git). Only JPG, PNG, WEBP or HEIC up to 5 MB are
accepted, and the file type is checked from the image itself.

**Push notifications.** The API sends them through Expo's free push service when:
a worker gets a job offer; the customer's worker accepts, is on the way, arrives, or finishes;
nobody was free; a booking is cancelled; a payment arrives; or an admin approves or rejects a worker.
Tapping a notification opens that booking.

They **don't work in Expo Go** on Android (Expo removed that in SDK 53), so you need a development build:

```bash
cd mobile
npx eas-cli@latest login          # free Expo account
npx eas-cli@latest init           # adds the project id push needs
npx eas-cli@latest build --profile development --platform android
```

Install the APK it gives you, then run `npx expo start` as usual. Everything else keeps working in Expo Go;
the app just updates live while it's open instead of sending notifications.

## Status

| Done | Not yet |
|------|---------|
| Sign-up/login (phone + PIN), SMS code check, Forgot PIN | Real SMS needs an Africa's Talking account |
| NRC front/back + selfie upload, admin photo review | Automatic NRC/face matching |
| Zone detection, wave dispatch, accept/decline/drop job | |
| Push notifications for offers, job updates, payments | Needs an EAS development build to receive |
| Live worker location, ETA and maps | Turn-by-turn route on the map |
| GPS check-in/check-out, booking ahead (up to 14 days) | |
| Mobile Money flow (**mocked**) | Real MTN MoMo / Airtel Money APIs |
| Two-way ratings, earnings, admin stats | |
| Reports + emergency button, weekly payouts (sent by hand) | Automatic MoMo payouts (disbursement API) |
| Agency portal, zone management | Agency logins created from the admin screen |
| SQLite on a Railway volume, daily backups ([DEPLOY.md](DEPLOY.md)) | PostgreSQL (needed for more than one server) |

**Mock payments:** a payment "succeeds" after 3 seconds. Numbers ending in `0000` always fail,
so you can test the retry screen. To go live, add MTN and Airtel providers in
[`backend/src/payments/index.js`](backend/src/payments/index.js). The flow (request to pay, then
a callback) already matches how both providers work.

## Tests

```bash
cd backend && npm test     # 42 tests: business-rule and setup unit tests + 22 end-to-end (booking, dispatch,
                           # payments, SMS, NRC photos, push, zones, booking ahead, reports, payouts, agencies)
cd mobile && npm run typecheck && npx expo lint
```

How the code is organised (Larman's GRASP patterns and layers): see [DESIGN.md](DESIGN.md).

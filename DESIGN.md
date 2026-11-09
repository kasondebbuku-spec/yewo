# How the code is organised

Yewo's backend follows Craig Larman's approach from *Applying UML and Patterns*: a **layered
architecture**, with responsibilities assigned by the **GRASP** patterns. This page maps each
pattern to real files, so a new developer knows where a change belongs.

## Layers

```
┌────────────────────────────────────────────────────────────────────┐
│ UI layer          routes/*.js         HTTP in, JSON out. No rules.  │
│                   mobile/src/app/*    Screens. No business rules.   │
├────────────────────────────────────────────────────────────────────┤
│ Application       services/*.js       One module per use case.      │
│ (use cases)                           Coordinates; decides nothing. │
├────────────────────────────────────────────────────────────────────┤
│ Domain            domain/*.js         Business rules. Pure code:    │
│                                       no database, no HTTP.         │
├────────────────────────────────────────────────────────────────────┤
│ Technical         repos/*.js  db.js  push.js  realtime.js  sms.js   │
│ services          payments/  geo.js                                 │
└────────────────────────────────────────────────────────────────────┘
```

Dependencies only point **down**. The domain layer imports nothing above it, so its rules are
tested without a server (`test/domain.test.js` runs in milliseconds). A domain rule that fails throws
a `DomainError` (`invalid`, `forbidden`, `conflict`, `not_found`). Only `app.js` turns those into
HTTP status codes.

## GRASP patterns, and where they are

| Pattern | Question it answers | In Yewo |
|---|---|---|
| **Controller** | Who receives a system event from the UI? | One use-case controller per feature: `services/bookingService.js` (book a service), `incidentService.js` (report a problem / emergency / resolve), `payoutService.js` (run payouts / mark sent), `zoneService.js` (manage zones), `agencyService.js` (agency portal). Routes call these; they never hold rules themselves. |
| **Information Expert** | Who should own a rule? | Whoever has the information. `domain/zone.js`: a `Zone` knows whether it `contains(point)`. `domain/money.js` owns price, fees and the 15% split. `domain/jobLifecycle.js` owns every allowed status change. `domain/bookingTime.js` owns opening hours and lead times. `domain/payout.js` decides which jobs are due (`isDue`). `domain/incident.js` decides who may report what, and when. |
| **Creator** | Who creates a Job / Payout / Incident? | The class with the data to initialise it. `bookingService.createBooking` creates jobs: it has the customer, service, zone, price and time. `payoutService.runWeeklyPayouts` creates payouts from the jobs it groups. `incidentService.report` creates incidents. |
| **Low Coupling** | How do we keep changes local? | Routes depend on services, not tables. Services depend on repositories, not SQL. The mobile app depends on JSON views (`jobView`, `incidentView`, `payoutView`), not database columns. |
| **High Cohesion** | Does each module do one thing? | One module per concern: `bookingScheduler.js` only wakes scheduled jobs; `notifier.js` only delivers messages; each repo only persists one aggregate. In the app, `EmergencyButton`, `ReportProblem` and `ui.tsx` (shared building blocks such as `Tile`) each have one job. |
| **Polymorphism** | How do we handle "varies by type" without `if/else` chains? | `INCIDENT_KINDS` in `domain/incident.js`. Each kind carries its own policy (who reports it, at which job stages, whether it's urgent). The service asks the kind instead of switching on its name. A new kind is one new entry. Payment providers (`payments/index.js`) share one `requestToPay` shape, and SMS and push providers do the same. |
| **Pure Fabrication** | Where do responsibilities go that don't belong to a business concept? | Into made-up classes with a clear job. `repos/*.js` (persistence), `services/bookingScheduler.js` (a clock that wakes up "booked ahead" jobs), `services/notifier.js` (delivering messages), `db.js` migrations. |
| **Indirection** | How do we avoid direct coupling between two parts? | `notifier.js` sits between use cases and delivery (Socket.IO + Expo push). Services say *who* and *what*, not *how*. `jobRepo.applyTransition` sits between routes and the jobs table. |
| **Protected Variations** | What is likely to change, and how do we shield the rest? | **Payments:** real MTN/Airtel plug into the provider interface. **Payouts:** `markPaid` is the one place a MoMo disbursement API will plug in. **SMS:** the console or Africa's Talking provider is chosen in config. **Business numbers** (hours, fees, radius, emergency numbers) live in `config.js`. **HTTP:** the domain never sees it, through `DomainError`. **Schema:** `PRAGMA user_version` migrations in `db.js` upgrade old databases in place. |

## Where to make a change

| I want to… | Change |
|---|---|
| Change opening hours, lead time, fees, the payout week | `backend/src/config.js` (rules read it) |
| Add a kind of report | One entry in `INCIDENT_KINDS` (`domain/incident.js`) and its label shows up in the app |
| Allow a new job status change | `TRANSITIONS` in `domain/jobLifecycle.js` |
| Connect real MoMo payouts | `services/payoutService.js` → `markPaid` |
| Send emergencies by SMS too | `services/notifier.js` |
| Add a column | Table in `db.js`, bump `SCHEMA_VERSION`, add a step in `migrate()` |

## A note on older code

The first features (accounts, dispatch, payments, ratings) came before this structure, so
`routes/jobs.js`, `routes/workers.js` and `dispatch.js` still hold some SQL directly. Job status
changes already go through `domain/jobLifecycle.js` and `jobRepo.applyTransition`, and pricing
through `domain/money.js`. The next step is to move ratings and payments into services the same
way when they are next changed.

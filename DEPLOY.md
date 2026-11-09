# Putting the Yewo API online (Railway)

The API runs on [Railway](https://railway.com) from this GitHub repo. The database (SQLite), NRC photos
and daily backups live on a Railway **volume**, so they survive restarts and redeploys. Every push to
`main` redeploys automatically. Expect about **$5 a month** on the Hobby plan; check Railway's pricing page.

## One-time setup (about 15 minutes)

**1. Create the project**
- Sign in at railway.com with your GitHub account and choose the **Hobby** plan.
- **New Project → Deploy from GitHub repo →** `kasondebbuku-spec/yewo`. Allow Railway to read the repo
  when GitHub asks.

**2. Point it at the backend.** Open the new service → **Settings**:
- **Root Directory:** `/backend`
- **Config file path** (under "Config-as-code"): `/backend/railway.json`. This tells Railway to build
  with the Dockerfile and to check `/health` before switching traffic to a new version.

**3. Add the volume.** In the project canvas, right-click the service (or press `Ctrl+K`) → **Add Volume**.
Set the **mount path** to `/data`.

**4. Set the variables.** Open the service → **Variables → Raw Editor**, paste, and fill in:

```env
NODE_ENV=production
DATA_DIR=/data
JWT_SECRET=<paste a long random value, see below>
ADMIN_PHONE=<your number, e.g. 0971234567>
ADMIN_NAME=<your name>
ADMIN_PIN=<6 digits you'll remember>
SHOW_SMS_CODES=true
```

To make the `JWT_SECRET`, run this on your computer and paste the result. Never reuse it or share it:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`SHOW_SMS_CODES=true` makes the app show sign-up codes on screen, because no real SMS is sent yet.
Use it for a **closed pilot only**: anyone could sign up with any number. Once you have an
Africa's Talking account, replace it with:

```env
SMS_PROVIDER=africastalking
AT_USERNAME=<your username>
AT_API_KEY=<your key>
```

**5. Give it a web address.** Service → **Settings → Networking → Generate Domain**. You get something
like `https://yewo-production.up.railway.app`.

**6. Check it.** Open `https://<your-domain>/health`. It should show `{"ok":true,"service":"yewo-api"}`.
The **Deploy Logs** should show `Created admin login for 09…` and `Database backup: /data/backups/…`.

If the logs say **"Unsafe production settings"**, the volume or `JWT_SECRET` is missing. The API refuses
to start rather than lose data.

## Point the app at the live server

In `mobile/`, copy `.env.example` to `.env`, put your Railway address in it, and restart Expo:

```bash
cd mobile
copy .env.example .env      # then edit .env
npx expo start --clear
```

Now Expo Go talks to the online API from anywhere: no shared Wi-Fi, and your computer's API can be off.
Log in with the `ADMIN_PHONE` and `ADMIN_PIN` you set.

## What's different from your computer

- **No demo accounts.** The demo PIN 1234 is public on GitHub, so production never creates them.
  Customers and workers sign up in the app. Approve workers from the admin screen.
- **Zones, services and agencies** are created automatically on first start (same as the seed).
  Agency logins aren't yet created from the admin screen; that's a small follow-up.
- **Backups:** one copy of the database every 24 hours in `/data/backups`, newest 7 kept. They sit on
  the same volume, so they protect against mistakes but not against losing the volume. Download one now
  and then (Railway volume browser), or turn on Railway's volume backups if your plan has them.
- **One server.** SQLite with a volume means a single instance (Railway doesn't allow replicas with a
  volume). That's plenty for a pilot. Move to PostgreSQL when you need more than one server.
- **Payments are still mocked** until MTN/Airtel keys are added.

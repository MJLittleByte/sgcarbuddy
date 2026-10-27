# SG Car Buddy — API (Cloudflare Worker, free plan)

The app never calls LTA, URA or OneMap with a key. This Worker holds the keys, calls the upstream APIs, caches the
responses and returns a small, stable `/v1` JSON contract (`../shared/contract.ts`). Every payload is **island-wide**:
the app filters by place on the phone, so no location ever reaches this server.

```
phone app ──HTTPS──▶ sgcarbuddy-api (this Worker) ──AccountKey──▶ LTA DataMall  (carpark lots, EV, cameras, incidents,
                                         │                                       travel times, faulty lights, PUB floods)
                                         ├──x-api-key──▶ data.gov.sg (HDB carpark info + totals, NEA weather + radar)
                                         ├──token──────▶ OneMap (place / postal code search)
                                         └──AccessKey──▶ URA Data Service (URA carpark rates, optional)
```

**Not deployed yet.** Until `npm run setup` has run, release builds use demo mode (see `../mobile/README.md`).

## API keys

| # | Key | Used for | Needed? | Apply at | Cost |
|---|---|---|---|---|---|
| 1 | **LTA DataMall AccountKey** | Carpark availability (HDB/URA/malls), EV chargers (EVCBatch), traffic cameras, incidents, travel times, faulty lights, PUB flood alerts | **Yes** | <https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html> (purpose: Mobile APP) | Free |
| 2 | **data.gov.sg API key** (production tier) | HDB carpark details and total lots, NEA rain/forecast/temperature/4-day, rain radar | Recommended (keyless = 6 calls / 10 s) | <https://data.gov.sg> → Dashboard → API keys | Free |
| 3 | **OneMap account** (email + password) | Place / postal code search | Recommended (works without today; OneMap is moving to tokens) | <https://www.onemap.gov.sg/apidocs/register> | Free |
| 4 | **URA Data Service AccessKey** | Exact URA carpark rates and capacity | Optional (without it, URA carparks use URA's standard coupon rates, labelled "std. rate") | <https://eservice.ura.gov.sg/maps/api/> | Free |
| 5 | **Cloudflare account** | Hosting this Worker | Yes | <https://dash.cloudflare.com> | Free plan |

Development currently reuses the SG BusXing LTA and data.gov.sg keys in `worker/.env.local` (gitignored). Register
separate keys for this app before release and replace them in `.env.local`, then `npm run setup`.

## Endpoints (`/v1`)

| Endpoint | Upstream | Cache (fresh / last-good) |
|---|---|---|
| `GET /v1/health` | none (reports which keys are configured) | none |
| `GET /v1/carparks/catalog` | data.gov.sg HDB Carpark Information CSV + HDB carpark-availability (totals) + DataMall CarParkAvailabilityv2 (URA/LTA carparks) + URA Car_Park_Details (optional) | 24 h / 7 d |
| `GET /v1/carparks/availability` | DataMall CarParkAvailabilityv2 (all pages) → `{ id: [car, motorcycle] }` | 60 s / 1 h |
| `GET /v1/ev` | DataMall EVCBatch → signed S3 file (≈3.3 MB), **passed through unparsed** (normalised on the phone, to stay inside the free plan's 10 ms CPU) | 4 min / 1 h |
| `GET /v1/roads/cameras` | DataMall Traffic-Imagesv2 (8 cameras since 30 Jun 2026), named from API guide Annex G; data.gov.sg fallback | 60 s / 15 min |
| `GET /v1/roads` | DataMall TrafficIncidents, v2/FaultyTrafficLights (SVY21 → WGS84), EstTravelTimes, PubFloodAlerts | 2 min / 1 h |
| `GET /v1/weather` | NEA two-hr-forecast, rainfall, air-temperature, four-day-outlook (fallback: the app reads NEA directly) | 5 min / 3 h |
| `GET /v1/weather/radar` | NEA weather-radar-images/70km → last 12 frames | 4 min / 1 h |
| `GET /v1/weather/radar/{yyyyMMddHHmm}.png` | One radar frame, proxied (NEA's links expire after 20 min and have no CORS) | immutable |
| `GET /v1/places?q=` | OneMap elastic search | 24 h / 7 d |

- If upstream fails or is slow, the Worker answers with its last good copy (`"stale": true`, up to the last-good TTL)
  within 2.5 s and lets the refresh finish in the background, so it recovers by itself: **never restart it to "fix"
  data** (a restart empties the cache). With nothing cached, network failures are `502 upstream_unavailable`.
- At most 4 upstream requests are in flight at once (Cloudflare allows 6 open connections per request, and some
  networks drop every connection when too many open together). A dropped connection is retried once.
- Errors return `{ "error": { "code", "message" } }`. Rate limit: 120 requests / 60 s per IP.
- `npm run catalog` writes a carpark snapshot into the app (`mobile/src/data/carparks.json`) for first launch, offline and demo mode.

```bash
npm run typecheck && npm test
```

## Local development

```bash
cd worker
npm install
cp .env.example .env.local        # fill in LTA_ACCOUNT_KEY (and the optional keys)
npm run dev:node                  # → http://localhost:8787
# If HTTPS_PROXY is set, it restarts itself once so Node uses it and the operating system's trusted certificates
# (scripts/node-net.ts). The start-up line says "Network: via HTTPS_PROXY · system certificates".
# Log lines are timestamped; "upstream fetch failed <host> <reason>" marks a network drop-out (the app keeps
# showing the last good data meanwhile).

curl localhost:8787/v1/health
curl localhost:8787/v1/carparks/availability | head -c 300
curl localhost:8787/v1/roads/cameras

cd ../mobile && npm run dev       # mobile/.env.local: VITE_API_BASE_URL=http://localhost:8787
```

| Dev command | Runs | Use when |
|---|---|---|
| `npm run dev:node` | Same Worker code under plain Node 24 | Quickest local start |
| `npm run dev` | `wrangler dev` (workerd) | Checking Cloudflare-specific behaviour |
| `npm run dev:remote` | `wrangler dev --remote` | Final check before deploy |
| `npm run catalog` | Builds the bundled carpark snapshot | After HDB/URA/LTA carpark lists change (monthly is plenty) |

## Deploy to Cloudflare (free Workers plan)

No card, no paid add-ons: the Worker only uses features included in the free plan (Workers, Rate Limiting binding,
Cache API, observability logs).

### Step 1: Cloudflare account (once, 2 minutes)
1. Sign up / log in at <https://dash.cloudflare.com> (free).
2. Open **Workers & Pages** (left menu). If asked, **choose your workers.dev subdomain** (e.g. `sgcarbuddy`).
   The API will live at `https://sgcarbuddy-api.<subdomain>.workers.dev`. Set it **before** `npm run setup`: the script runs
   `wrangler deploy` non-interactively, so it cannot answer wrangler's "register a subdomain?" prompt. If the dashboard only
   shows **Create application**, open `https://dash.cloudflare.com/<account-id>/workers/onboarding` (or the
   **Workers plans** / **Account home** page) to set it. You do **not** need to click *Create application*: the Worker is
   created by the first deploy.
3. Stay on the **Free** plan (100,000 requests/day). Nothing to enable.

### Step 2: Fill in `worker/.env.local` (once)
```bash
cd worker
npm install
cp .env.example .env.local        # skip if it already exists
```
Edit `.env.local`:
```ini
LTA_ACCOUNT_KEY=your-lta-accountkey      # required
DATAGOVSG_API_KEY=                       # recommended, uploaded only if filled in
ONEMAP_EMAIL=                            # optional, uploaded only if filled in
ONEMAP_PASSWORD=
URA_ACCESS_KEY=                          # optional, uploaded only if filled in
ALLOWED_ORIGINS=*                        # local dev only, never uploaded
CF_ACCOUNT_ID=                           # optional, for `npm run usage` (step 5)
CF_ANALYTICS_TOKEN=                      # optional, for `npm run usage` (step 5)
```

### Step 3: Deploy + set the secrets automatically (every deploy)
For the Play release, use **this app's own keys** in `worker/.env.production` (gitignored); the script falls back to
`.env.local` with a warning when that file doesn't exist.
```bash
cp .env.production.example .env.production   # once; fill in the production keys
npm run deploy:prod                          # same as npm run setup
```
`scripts/setup.mjs` does six steps and stops with a clear error if one fails:

| # | Step | Detail |
|---|---|---|
| 1 | Check the key file | `.env.production` (else `.env.local`, or `--env-file=…`); fails if `LTA_ACCOUNT_KEY` is missing; lists which secrets it will upload |
| 2 | Cloudflare login | Runs `wrangler whoami`; if not logged in, opens the browser for `wrangler login` (first time only) |
| 3 | Typecheck, tests, deploy | `npm run typecheck`, `npm test`, `wrangler deploy`; reads the `*.workers.dev` URL from the output (asks you to paste it if it can't) |
| 4 | Upload secrets | `wrangler secret bulk` with the non-empty `LTA_ACCOUNT_KEY`, `DATAGOVSG_API_KEY`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `URA_ACCESS_KEY`, sent via stdin (never written to disk) |
| 5 | Smoke test | `/v1/health` (waits until `ltaConfigured: true`), `/v1/carparks/availability`, `/v1/roads/cameras` |
| 6 | Point the app at it | Writes `mobile/.env.production` with `VITE_API_BASE_URL=<worker URL>` and `VITE_AD_PLACEHOLDER=off` |

Check it yourself any time:
```bash
curl https://sgcarbuddy-api.<subdomain>.workers.dev/v1/health     # {"ok":true,"ltaConfigured":true}
npx wrangler secret list                                         # names of the secrets on Cloudflare (values hidden)
```

### Step 4: Build the app against the live API
```bash
cd ../mobile && npm run android:apk      # release builds use mobile/.env.production; `npm run dev` keeps .env.local
```

### Step 5 (optional): Watch the free quota
1. `CF_ACCOUNT_ID`: run `npx wrangler whoami`, or dashboard → Workers & Pages (right sidebar).
2. `CF_ANALYTICS_TOKEN`: dashboard → My Profile → API Tokens → Create Token → template **Read analytics and logs**.
   (Deliberately not named `CLOUDFLARE_API_TOKEN`, so wrangler never uses this read-only token as its login.)
3. Add both to `.env.local`, then:
```bash
npm run usage     # last 7 days + today vs 100,000, and today's projected total
```
Exits with code 2 above 70%, so it can drive an alert. The dashboard shows the same under
Workers & Pages → `sgcarbuddy-api` → Metrics.

### Later changes
| Change | Do |
|---|---|
| Code change only | `npm run deploy` (or `npm run setup` to also re-test) |
| New / rotated key | Edit `.env.local` → `npm run setup`. No app release needed |
| Remove an optional key | Clear it in `.env.local` **and** `npx wrangler secret delete <NAME>` (setup only uploads, never deletes) |
| Manual instead of the script | `npx wrangler login` → `npm run deploy` → `npx wrangler secret put LTA_ACCOUNT_KEY` (and the optional keys) → set `VITE_API_BASE_URL` in `mobile/.env.production` |

**The free quota resets at 00:00 UTC = 08:00 Singapore.** If it runs out, every call fails (error 1027) until then, which could
be the evening rush. Upgrade to Workers Paid ($5/month, 10M requests included) at ~60–70k requests/day: dashboard →
Workers & Pages → Plans. No code or app change needed.


**Capacity (estimate):** an active user makes about 25 Worker requests a day (availability every minute only while the
Parking tab is open, roads every 2–5 min, EV every 3 min only on the EV tab; weather goes straight to data.gov.sg). The free
plan's 100,000 requests/day therefore covers roughly 3,000–4,000 daily users; Workers Paid ($5/month) covers far more.
Watch it with `npm run usage`.

**Free-plan CPU (10 ms per request):** the EV file is passed through without parsing for this reason. The daily catalogue
build parses about 1 MB of CSV/JSON and may exceed 10 ms; if Cloudflare rejects it, the app keeps working from its bundled
snapshot. Measure after the first deploy (`wrangler tail`) and move it to a Cron Trigger or Workers Paid if needed.

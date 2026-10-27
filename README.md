# SG Car Buddy: Park, EV & Cams

Everything a Singapore driver needs: parking, EV, checkpoint cams and rain. A no-login Android app (`com.sgcarbuddy.app`).

| Folder | What |
|---|---|
| [`mobile/`](mobile/README.md) | The app: React 19 + TypeScript + Vite 8 + Capacitor 8 → Android (`com.sgcarbuddy.app`) |
| [`worker/`](worker/README.md) | API on Cloudflare Workers (free plan). **Holds every API key**, never the app |
| `shared/` | `/v1` contract types and normalisers used by both (carparks, EV, roads, NEA, OneMap, SVY21) |
| `SG_CAR_BUDDY_PLAN.md` | Product, UX and implementation plan (source of truth, incl. status and the key list) |
| `docs/design/` | Design concept boards (Day = A Kerb, Night = C Night Drive) and logo directions |
| `docs/play-store/` | Play listing text, Data safety answers, icon, feature graphic, screenshots |
| `site/` | Privacy policy / support site → https://mjlittlebyte.github.io/sgcarbuddy/ (GitHub Pages) |

## Quick start

```bash
cd worker && npm install && cp .env.example .env.local   # add LTA_ACCOUNT_KEY (+ optional keys)
npm run dev:node                                          # http://localhost:8787

cd ../mobile && npm install
echo "VITE_API_BASE_URL=http://localhost:8787" > .env.local
npm run dev                                               # http://localhost:5173
```

Leave `VITE_API_BASE_URL` empty for demo mode (no server needed).

| Check | Command |
|---|---|
| App tests / types / build | `cd mobile && npm test && npm run typecheck && npm run build` |
| Worker tests / types | `cd worker && npm test && npm run typecheck` |
| Debug APK | `cd mobile && npm run android:apk` |
| Deploy the Worker | `cd worker && npm run deploy:prod` (Cloudflare login, secrets, smoke test, writes `mobile/.env.production`) |

## Release to Google Play

1. **Keys**: register this app's own LTA DataMall (and data.gov.sg, OneMap, URA) keys →
   `cd worker && cp .env.production.example .env.production` and fill them in.
2. **Backend**: `npm run deploy:prod` → creates / updates the `sgcarbuddy-api` Worker, uploads the keys as Cloudflare
   secrets, smoke-tests it and writes the live URL to `mobile/.env.production`.
3. **Upload key** (once): `cd ../mobile && npm run android:keystore` (kept in `~/sgcarbuddy-keys/`, back it up).
4. **Bundle**: bump `androidVersionCode` in `mobile/package.json` for every upload, then `npm run android:aab` →
   `mobile/android/app/build/outputs/bundle/release/app-release.aab` (checks the live API, signing and version first).
5. **Store listing**: everything to paste is in [`docs/play-store/listing.md`](docs/play-store/listing.md); privacy
   policy URL https://mjlittlebyte.github.io/sgcarbuddy/privacy/.

## Never commit

`worker/.env.local`, `worker/.env.production`, `mobile/.env.local`, `mobile/android/keystore.properties`,
`mobile/android/local.properties`, any `*.jks` / `*.keystore` (all gitignored). `mobile/.env.production` is committed on
purpose: it only holds the public Worker URL.

# SG Car Buddy — mobile app (React + Capacitor → Android)

Version in `package.json` (`version` + `androidVersionCode`). Product and UX source of truth: [`../SG_CAR_BUDDY_PLAN.md`](../SG_CAR_BUDDY_PLAN.md).

- **Stack:** React 19 + TypeScript, Vite 8, Capacitor 8 (Android first), MapLibre GL 5 + OpenFreeMap tiles (no key).
  Self-hosted fonts: Figtree (UI) and Space Grotesk (Night numerals).
- **Look:** one layout, two themes. **Day** = concept A "Kerb", **Night** = concept C "Night Drive". Settings → Appearance:
  Auto (follows the phone) / Day / Night, plus the ☀/☾ button next to the search bar.
- **App ID:** `com.sgcarbuddy.app` (permanent once uploaded to Play). Play title "SG Car Buddy: Park, EV & Cams"; launcher label "SG Car Buddy".

## Run it

```bash
cd mobile
npm install
npm run dev            # http://localhost:5173
npm test               # domain logic: HDB/URA rate engine, lots, EV, lists, search, rain, time
npm run typecheck
npm run build          # typecheck + production web build into dist/
```

### Demo mode vs live data

| `VITE_API_BASE_URL` | Carparks | EV | Roads | Weather |
|---|---|---|---|---|
| empty | Bundled HDB/URA/mall list, **sample** lots | **Sample** chargers | **Live** cameras (data.gov.sg), sample incidents and travel times | **Live** NEA (no radar) |
| Worker URL (`http://localhost:8787` locally) | **Live** lots (LTA) | **Live** connector status (LTA EVCBatch) | **Live** cameras, incidents, travel times, PUB floods | **Live** NEA + rain radar |

Demo data is labelled "Sample data" and kept apart from live data in storage. `VITE_API_BASE_URL` is a **public URL**,
never a secret: keys live only in the Worker (`../worker/README.md`).

## Structure

```
src/app/         App.tsx (shell: map, top bar, sheet, nav, routes), AppStore (prefs, saved, parked, catalogue),
                 DataContext (all polls, tab-aware), platform (theme, Android back), tabs, boot
src/components/  MapView (one persistent MapLibre map), pins (canvas pin images), BottomSheet (snap sheet),
                 Sheet (modal), AdSlot (banner + in-feed), Icon, ui (lots block, freshness, toggles…)
src/screens/     ParkingPanel, EvPanel, RoadsPanel, WeatherPanel, CarparkDetail, ChargerDetail, CameraViewer,
                 SearchScreen, Parked (sheet + screen), SettingsScreen, Onboarding, FiltersSheet
src/lib/domain/  rates (HDB/URA estimator + reminders), availability, lists, geo, rain, search, time, format
src/lib/api/     client (Worker), direct (NEA + cameras from data.gov.sg), demo
src/lib/         native (navigate hand-off, share, local notifications), storage/store, hooks
src/data/        carparks.json (bundled snapshot: cd ../worker && npm run catalog)
```

## Android

Requirements: Android Studio with SDK 36, and **JDK 21** (Android Studio's bundled JBR works).

```bash
npm run android:apk     # build web → cap sync → debug APK
# APK: android/app/build/outputs/apk/debug/app-debug.apk
# install: adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open    # open in Android Studio (Run ▶ on a device / emulator)
```

- Release builds read `mobile/.env.production` (written by `cd ../worker && npm run deploy:prod`). Until the Worker is deployed,
  build a demo APK with `VITE_API_BASE_URL= npm run android:apk`.
- The Kotlin version is pinned in `android/variables.gradle` (one version for every Capacitor plugin).
- Using a local Worker from the emulator (`http://10.0.2.2:8787`) needs plain HTTP: `CAP_DEV_HTTP=1 npm run android:apk`
  (dev builds only).

## Brand

Logo **"Pin"**: a white map pin carrying a bold blue P on a blue gradient tile (directions compared in
`../docs/design/logo/index.html`). `npm run brand` regenerates everything from `src/brand/mark.ts`: favicon, icon SVGs,
the Android adaptive icon (gradient background, foreground, themed/monochrome), the loading screen, the legacy launcher
PNGs and the 512 × 512 Play icon (`../docs/play-store/icon-512.png`, rendered with the installed Chrome).

## Release

```bash
npm run android:keystore   # once: upload key (~/sgcarbuddy-keys/) + android/keystore.properties (gitignored)
npm run release:check      # live https API, no mock ads, signing key, version
npm run android:aab        # signed bundle → android/app/build/outputs/bundle/release/app-release.aab
npm run store:graphic      # Play feature graphic (offline)
npm run store:screens      # Play screenshots from a local release-like build (see scripts/store_assets.mjs)
```

`android:apk` / `android:aab` run Gradle through `scripts/gradle.sh`, which picks a JDK 21+ (Capacitor 8 needs it) even when
the shell's default Java is older. Bump `androidVersionCode` in `package.json` for every Play upload (`version` is the name users see). Listing text,
Data safety answers and permission notes: `../docs/play-store/listing.md`. Privacy policy: `../site/`.

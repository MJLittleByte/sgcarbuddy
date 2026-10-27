# SG Car Buddy: Product, UX and Implementation Plan

**Status:** v0.3. **Implementation v0.1 done (27 Oct 2026)**: all four tabs, search, details, camera viewer, parked car + reminders, settings, onboarding, Day/Night themes, Worker API, tests, debug APK. See §23 for what's done, deviations and what's pending.  
**Document date:** 26 October 2026  
**Name (confirmed 28 Oct 2026):** Play title **"SG Car Buddy: Park, EV & Cams"** (30-character limit), short description "Everything a Singapore driver needs: parking, EV, checkpoint cams and rain.", launcher label "SG Car Buddy", application ID `com.sgcarbuddy.app`. Repository: https://github.com/MJLittleByte/sgcarbuddy (public).  
**Primary release target:** Google Play / Android. **Secondary:** iOS later, from the same codebase.  
**Sister app:** SG BusXing (`../sgBusXing`). Same stack, same repository layout, same Cloudflare free-plan Worker pattern and the same plan format. Its rain feature is reused here.

> This plan is the source of truth for the first implementation. The wireframes are low-fidelity and show structure only; visual direction comes from the concept boards. Data facts were checked against official sources on 26 Oct 2026 (§22). Items marked **(verify)** must be re-checked during Phase 1.

### Owner decisions so far (26 Oct 2026)

| Topic | Decision |
|---|---|
| Map and place search | **MapLibre + OpenFreeMap** for the map, **OneMap** (SLA) for search: places, postal codes, HDB blocks, buildings. No Google billing. **Navigate** hands off to Google Maps or Waze |
| Origin/destination search | **Removed.** One search field ("Where to?") plus **Near me**. No "from", no "Start Now" |
| Bottom navigation | **4 tabs: Parking · EV · Roads · Weather**, all on **one shared map**. The chosen place (current location or a searched destination) stays the same when you switch tabs |
| Tab names (review 1) | **"Park" → "Parking"** ("Park" could read as a garden park). **"Charge" → "EV"** with a **bolt icon** ("Charge" could read as pricing). **Roads** kept, with a traffic-camera icon |
| EV tab (review 1) | **Can be hidden in Settings** ("Show EV tab"). Default: **on** for the Electric car profile, **off** for Car and Motorcycle. Hidden = 3 tabs (Parking · Roads · Weather) |
| Traffic cameras | **Roads tab.** A feed of **all 8 live LTA cameras** (Woodlands ×3, Tuas ×3, Sentosa ×2) with LTA travel time to each checkpoint, plus incidents, PUB flood alerts and faulty traffic lights |
| Ads (review 1) | Bottom banner on every main tab (as SG BusXing) **plus one in-feed ad in the Roads camera feed, after the 2nd camera, about the size of a camera image** (§15) |
| Weather (review 1) | Kept lean: **radar + rain now + next 2 hours + 4-day strip**. 24-hour regional forecast moved to v1.1 |
| Vehicle types (v1) | **Car + Motorcycle**, chosen once in a vehicle profile. EV owners also pick their plug type |
| Extra v1 features | **Parked car + reminders**, **Saved places**, **Rain radar** |
| Not in v1 (owner) | "Rain at destination" covered-carpark hint and COE prices → backlog (§5) |
| Design boards | **Round 1 done (26 Oct 2026):** A · Kerb, B · Gantry, C · Night Drive, 4 screens each (Parking, EV, Roads, Weather), light and dark (§9) |
| **Design direction (owner, 26 Oct 2026)** | **A + C combined.** **Day = A · Kerb**, **Night = C · Night Drive**. **One shared layout** (A's structure: labelled 4-tab bar, docked bottom sheet, pill pins, lots block with fill bar). Switching Day ↔ Night changes **only colours and styling** (map style, surfaces, accent, glass, glow); nothing moves (§9.1) |
| Theme setting | Settings → Appearance: **Auto / Day / Night**. Auto follows the phone's dark mode. Plus a one-tap ☀/☾ button on the map (as SG BusXing) |
| Remaining screens | **Built directly** in the Day/Night style (no separate wireframe board); the owner reviews them in the running app and we adjust |
| First milestone | **All four tabs at once** (Parking, EV, Roads, Weather) plus search, details, camera viewer, parked car, settings |
| Keys during development | Reuse the **SG BusXing keys** in this app's local `worker/.env.local` (never committed). Features without a key use **dummy data**. At the end, list every key the app needs; the owner registers separate keys for this app |
| Name and repo (for now) | **sgcarbuddy** (`com.sgcarbuddy.app`), may change before the first Play upload. **Local git only**; GitHub push after the name is confirmed |

---

## 1. Product Summary

SG Car Buddy is a no-login, map-first companion for drivers in Singapore. It answers the four questions a driver has before and during a trip:

1. **Where can I park near where I'm going, and what will it cost?** Live lots for car or motorcycle, an estimated price for your stay, covered/free/night parking and gantry height.
2. **Where can I charge?** Live charger availability, plug type, kW and price, already filtered for your car.
3. **How are the roads?** Checkpoint cameras, expressway travel times, accidents, roadworks, flood alerts and faulty traffic lights.
4. **Is it raining there?** Rain now, the 2-hour forecast and an animated rain radar.

The user opens the app and sees a map of nearby carparks, each pin showing live free lots. One search field changes the place everything is about. One tap on a tab changes what the map shows, without reloading.

### Success criteria

- A returning driver sees live lots near them with **zero taps**, and near any destination in **two taps** (search → pick a result).
- Every carpark shows **lots for my vehicle**, **price for my stay** (estimated, with its basis shown) and **walk time to my destination**.
- EV owners see only chargers that fit their plug, with live "free / total" connectors.
- Switching Parking ↔ EV ↔ Roads ↔ Weather keeps the map, the zoom and the chosen place. There is no reload and no extra search.
- "I've parked" takes one tap, survives app restarts and reminds the driver before the rate changes or free parking ends.
- Stale, estimated or unknown data never looks live or exact.
- Usable with denied location (search-first), 200% font scale, dark mode, TalkBack and no network (cached).
- Runs on the Cloudflare Workers **free plan** at launch scale (§12.5).

---

## 2. UX Review of the Reference App (ParkUncle)

The reference app has the right bones: a full-bleed map, price pins, a "Nearby Spots" bottom sheet with Carparks / EV Chargers tabs, and clear filter groups. Its weaknesses are all fixable, and fixing them is how we beat it.

| # | Issue seen in the screenshots | Why it matters | SG Car Buddy fix |
|---|---|---|---|
| 1 | The From/To card with "Start Now" covers about 22% of the screen, and shows "Your Location" twice | Most drivers want parking near **one** place. A route planner duplicates Google Maps and Waze, and it hides the map | One floating **"Where to?"** search pill plus a **Near me** chip. **Navigate** hands off to Google Maps or Waze |
| 2 | Six differently styled floating controls (Cheap, Near, P, EV, filters, settings) in one row | Hard to scan. P/EV toggles duplicate the sheet's Carparks/EV tabs, and the meaning of their on/off state is unclear | Feature switching lives in the **bottom nav** (Parking / EV / Roads / Weather). Sort, stay and filters live **in the sheet header**. Settings goes in the search pill's overflow |
| 3 | "EV Chargers (0)" when the EV toggle is off | Looks like there are no chargers nearby, which is false | Never show a zero for a hidden layer. Counts only for what is shown |
| 4 | Every pin says "$1.20", and availability is a tiny coloured dot | The price is the same at most HDB carparks, so it adds nothing. The thing that differs (free lots) is hardest to see | Pins show **free lots for my vehicle** with an availability colour. Price appears on pins only when sorting by Cheapest, as **est. cost for my stay** |
| 5 | Pins overlap and hide each other | Unreadable in dense HDB estates | **Clustering** at low zoom ("12 carparks · 1.2k lots"). Symbol collision with priority for the selected and nearest pins |
| 6 | Filters open as a panel in the middle of the map, with Cancel/Apply. The operator list is long, in capitals, with "PTE. LTD." | Covers the context. Two extra taps. Hard to read | Filter **bottom sheet** with a live result count on the button ("Show 23 carparks"). Operator **brand names** ("Charge+", "SP Mobility") with search. Active filters show as removable chips |
| 7 | Names in capitals and cut off ("BLK 109/117 TECK WHYE..") | Hard to read, and the block number is often the key detail | Title case with block numbers kept ("Blk 109/117 Teck Whye Ln"). Two lines allowed. The full name is in the detail |
| 8 | "245 lots" and "1 lots", with no total and no legend | Is 245 a lot or a little? Grammar error | "245 free of 300" with a fill bar where the total is known. Correct plurals. A one-time legend |
| 9 | Big street photos take about 40% of each list row | Little value, and costly (Google Street View API). The list shows only 2–3 results | Compact rows (5–6 visible). Facts in their place: type, covered, height, walk time, est. cost |
| 10 | "~1 min" walk, but from where? | Ambiguous once you have searched for a place | "3 min walk **to ION Orchard**", or "**from you**" when using Near me |
| 11 | Car and motorbike glyphs on every row | Decoration: the user only drives one vehicle | A vehicle profile sets the lot type once. Rows show only my vehicle's lots |
| 12 | EV rows with no name, operator in capitals, "3/3" with no label | Can't tell where it is or what "3/3" means | Always a location name (falling back to the address). "3 of 3 free". Plug and kW chips |
| 13 | Settings show reminder toggles **on** while notifications are blocked by the device | Misleading: the user thinks reminders will arrive | Toggles show the real OS state. When blocked, they are disabled with a "Turn on notifications" action |
| 14 | "Ad unavailable" placeholder keeps its space | Wasted space, looks broken | The ad slot collapses when there is no ad, without moving the content above it |
| 15 | Unlabelled round map buttons (the recenter icon looks like a pin) | Unclear what they do | Labelled, recognisable controls (Material "my location" glyph) with tooltips and accessibility labels |
| 16 | No "find my car", no traffic, no weather | Drivers need these at the same moments as parking | Parked car + reminders, Roads tab, Weather tab, all on the same map |

---

## 3. Market Scan: Ideas to Adopt

Feature-level observations only. Competitor features change, so re-verify them before any marketing claim.

| Product | Strongest idea | SG Car Buddy takes / improves |
|---|---|---|
| ParkUncle *(screenshots provided)* | Map with price pins plus a Carparks / EV sheet; filters by agency, plug, power and operator | Same map + sheet skeleton. Lots-first pins, est. cost for your stay, clustering, vehicle profile |
| LTA MyTransport.SG / OneMotoring | Official carpark availability, traffic cameras, travel times | Same official sources, in one fast app, matched to your place and your vehicle |
| Parking.sg | Paying for coupon carparks | We don't handle payment. "Pay with Parking.sg" opens that app (**verify** its deep link), in Later |
| Google Maps / Waze | Navigation, live traffic | We hand off to them for navigation. We don't compete |
| PlugShare / operator apps | EV charger discovery and check-in | Official LTA live connector status across all operators, filtered by your plug |
| Causeway-jam apps and web pages | Checkpoint cameras | Checkpoint cards with live cameras **plus** LTA travel times to the checkpoint |
| SG BusXing *(own app)* | Rain near you, honest freshness, no login | Reused as-is and extended with the rain radar |

### What no single SG driver app combines today (our wedge)

1. **Lots-first pins** for my vehicle, plus **"est. $2.40 for 2 h"** from official HDB/URA rules, instead of a flat "$1.20".
2. **One place, four lenses.** The same map and destination for parking, charging, roads and rain.
3. **EV chargers shown inside the carpark detail** ("6 Type 2 chargers here · 3 free").
4. **Parked car** with reminders tied to the real rate rules ("Free parking ends 10:30 pm").
5. **Checkpoint card**: live camera, LTA travel time and incidents in one glance.
6. **Animated NEA rain radar** on the same map as the carparks.

---

## 4. Audience, Principles and Boundaries

### Primary audience

Singapore car drivers looking for parking near a destination or where they are now, especially in HDB estates and the city.

### Secondary audiences

- **EV owners:** need live charger availability that fits their plug.
- **Motorcyclists:** need motorcycle lot availability (`Y` lots). Most apps ignore them.
- **Johor trippers:** need checkpoint cameras and travel times.
- **Taller vehicles** (MPVs with roof boxes, vans): need the gantry height.

### Product principles

1. **Map first, one place.** The place (Near me or a searched destination) is global context. Every tab is a lens on it.
2. **My vehicle only.** Set the vehicle profile once. Every number afterwards is for that vehicle.
3. **Honest data.** Never invent lots, prices or statuses. Estimates are labelled "est." with their basis. Unknown shows "—". Stale data looks stale.
4. **Facts in the list, depth in the detail.** Rows show lots, walk time and est. cost. Rates tables, connectors and heights go in the detail.
5. **Hand off what others do best.** Navigation goes to Google Maps / Waze, payment to Parking.sg or the operator apps.
6. **No account.** Everything is stored on the device. The location never leaves the phone (§15).
7. **Encode twice.** Availability uses colour **and** a number **and** an accessible label.
8. **Ads never block driving decisions.** Banners only on root tabs, plus one labelled in-feed ad in the Roads camera feed. Never on details, the camera viewer, sheets, the parked flow or alerts.
9. **Glanceable, not for use while driving.** Large type and few words. The app is used while parked or by a passenger. We say so in onboarding, and there is no "drive mode".

### Not doing in v1 (and why)

| Not doing | Reason |
|---|---|
| Origin → destination routing, turn-by-turn | Google Maps / Waze own this. We hand off |
| Parking payment, EV charging sessions | Parking.sg and the operator apps own this |
| Mall carpark **rates** | LTA's only dataset is from 2018 (stale). We show lots, and rates only where official and current (§11.3) |
| ERP rates | LTA publishes them only as a PDF (the API was removed Sep 2024). Later |
| Traffic speed overlay | `TrafficSpeedBands` is a large dataset that is costly on the free plan. Later |
| Crowd-sourced reports, reviews, photos of carparks | Not authoritative. Moderation burden |
| Android Auto / CarPlay | Strict driver-distraction rules. Low v1 value |
| Login, sync, subscriptions | No-account promise |
| Interstitial, app-open or rewarded ads | Hurt trust |
| Petrol prices | No official real-time source (only SingStat monthly averages) |

---

## 5. Refined Feature Set

Priority: **M** must, **S** should, **C** could. Release: **v1**, **v1.1**, **Later**.

### Parking

| Feature | Pri | Rel | Data source |
|---|---|---|---|
| Map pins with live free lots for my vehicle, colour by availability, clustering | M | v1 | LTA `CarParkAvailabilityv2` (HDB, URA, LTA) + data.gov.sg HDB totals |
| "Where to?" search: places, postal codes, buildings, HDB blocks, carpark names | M | v1 | OneMap Search (via Worker) + local carpark index |
| Near me (current location) and "Search this area" after panning | M | v1 | Device location |
| Sheet list: walk time to place, free lots (of total), est. cost for stay | M | v1 | Derived on device |
| Sort: Nearest · Most space · Cheapest (est. for stay) | M | v1 | Derived |
| Stay length chip (30 min · 1 h · 2 h · 3 h · 4 h · Overnight) | M | v1 | Local |
| Filters: Has space · Covered · Free now · Night parking · Electronic · Min. height · Agency | M | v1 | HDB Carpark Information, URA Car Park Details, LTA |
| Carpark detail: lots per vehicle type, rates (now + rules), free/night parking, type, decks, gantry height, basement, EV chargers here | M | v1 | As above + EV join |
| Navigate (Google Maps / Waze / ask) | M | v1 | Maps URLs, intents (no API key) |
| Save carpark ★ (with live lots in Saved) | S | v1 | Local |
| Report a problem (prefilled email) | S | v1 | Local |
| Availability trend ("filling up": last 60 min sparkline) | C | v1.1 | Worker snapshot history (D1/DO) |
| "Pay with Parking.sg" handoff | C | Later | **Verify** deep link |

### EV

| Feature | Pri | Rel | Data source |
|---|---|---|---|
| EV pins: "free / total" connectors that fit my plug; colour by availability | M | v1 | LTA `EVCBatch` (all island, 5 min) |
| List: name, operator brand, plug, max kW, AC/DC, price ($/kWh or $/h), walk time | M | v1 | `EVCBatch` |
| Filters: Available now · Plug (preset from profile) · AC/DC · Min kW · Operator | M | v1 | `EVCBatch` |
| Charger detail: every connector's status, kW, plug, price, lot position ("L1 Lot 123"), hours | M | v1 | `EVCBatch` |
| EV chargers shown in carpark detail (nearby match) | S | v1 | Derived (§11.5) |
| Save charger ★ | S | v1 | Local |
| **Show EV tab** setting (default on only for the Electric car profile) | M | v1 | Local |

### Roads

| Feature | Pri | Rel | Data source |
|---|---|---|---|
| **Camera feed: all 8 cameras**, grouped Woodlands / Tuas / Sentosa, each image timestamped | M | v1 | `Traffic-Imagesv2` (8 cameras) |
| LTA travel time to each checkpoint (BKE → Woodlands, AYE → Tuas) on the group header | M | v1 | `EstTravelTimes` |
| **One in-feed ad after the 2nd camera** (about camera-image size, labelled "Ad") | M | v1 | AdMob (§15) |
| Camera viewer: full screen, pinch-zoom, swipe, auto-refresh, image timestamp | M | v1 | `Traffic-Imagesv2` |
| Incidents on map and list (accident, breakdown, roadworks, obstacle…), near the place first | M | v1 | `TrafficIncidents` |
| Expressway travel times by direction | S | v1 | `EstTravelTimes` |
| PUB flood alerts (map circle + banner when near the place) | M | v1 | data.gov.sg / DataMall flood alerts |
| Faulty traffic lights | C | v1 | `v2/FaultyTrafficLights` (SVY21 → WGS84) |
| Traffic speed overlay | C | Later | `v4/TrafficSpeedBands` |
| ERP gantry locations / rates | C | Later | LTA static (SHP / PDF) |

### Weather

| Feature | Pri | Rel | Data source |
|---|---|---|---|
| Rain now at the place (gauge) + 2-hour forecast (reuse SG BusXing) | M | v1 | NEA rainfall (5 min) + 2-hr forecast |
| **Rain radar** overlay on the map, animated last 60 min, scrubber | M | v1 | NEA `weather-radar-images/70km` |
| 4-day outlook (one compact strip) | S | v1 | NEA |
| 24-hour regional forecast | C | v1.1 | NEA (cut from v1 to keep Weather lean, review 1) |
| Flood alerts (shared with Roads) | M | v1 | PUB |
| Lightning nearby | C | v1.1 | NEA `weather?api=lightning` |
| Rain-at-destination covered-carpark hint | C | Later | Owner deferred |

### Cross-cutting

| Feature | Pri | Rel | Data source |
|---|---|---|---|
| Vehicle profile (Car / EV car + plug / Motorcycle) | M | v1 | Local |
| **Parked car**: one tap, timer, est. running cost, deck/lot note, find my car | M | v1 | Local |
| **Parked reminders**: before the rate changes, free parking ends, the night cap starts, or a custom time | M | v1 | Local notifications |
| **Saved places**: Home, Work, custom; one tap sets the place | M | v1 | Local |
| Parked mini-bar above the nav on every tab | M | v1 | Local |
| Light / Dark / System themes | M | v1 | Local |
| Banner ads + UMP consent (root tabs only) | M | v1 | AdMob |
| Parked photo (of the pillar or lot number) | C | v1.1 | Capacitor Camera |
| Android 16 Live Update notification for the parked timer | S | v1.1 | Native |
| Home-screen widget (parked timer / saved carpark lots), app shortcuts | S | v1.1 | Native |
| COE results card | C | Later | data.gov.sg (owner deferred) |

---

## 6. Information Architecture and Navigation

### 6.1 Structure

```text
App shell (one MapLibre map, mounted once, never unmounted)
├─ Top: "Where to?" search pill  ·  place chip (Near me / Near ION Orchard ✕)  ·  ⋮ (Settings)
├─ Map layers switch with the tab (pins, overlays)
├─ Bottom sheet (peek / half / full): tab-specific content
├─ Parked mini-bar (only while parked)
├─ Bottom nav: Parking · EV · Roads · Weather   (EV hideable in Settings → 3 tabs)
└─ Ad banner (root only, below the nav, collapses on no-fill)

Pushed screens (no nav, no ads): Carpark detail · Charger detail · Camera viewer ·
  Parked car · Search (full screen) · Filters (sheet) · Settings · Onboarding
```

### 6.2 Why one shared map

- **Smoothness:** switching tabs swaps layers and sheet content in under 150 ms. The camera position, zoom and place are kept. No WebGL context churn, so it works better on low-end phones.
- **One mental model:** "the map is my area; the tab is what I'm looking for."
- **Cross-lens moments are free.** From Parking, tap Weather and see the radar over the same carparks. From EV, the carpark under a charger is one tap away.

### 6.3 The place (global context)

- **Place** = `Near me` (live GPS) **or** a chosen place (search result, saved place, long-press on the map, "Search this area").
- It shows as a chip under the search pill: **◉ Near me**, or **📍 ION Orchard ✕** (✕ returns to Near me).
- All four tabs use it:
  - **Parking / EV:** list sorted by walk time to the place.
  - **Roads:** incidents near the place first.
  - **Weather:** rain at the place.
- The place persists across tabs and app restarts within 2 hours. After that the app reopens on Near me.

### 6.4 Tab behaviour

| Tab | Map shows | Sheet peek shows | Sheet half/full shows |
|---|---|---|---|
| **Parking** (default) | Carpark pins (lots), place pin, parked car | "18 carparks near ION Orchard · updated 1 min" + sort/stay/filters | Carpark list |
| **EV** (hideable) | EV pins (free/total), place pin | "9 charging sites · 14 Type 2 free" | Charger list |
| **Roads** | Cameras, incidents, flood circles, faulty lights | Opens at **full**, feed first: "All 8 cameras · Woodlands 14 min · Tuas 9 min" | **Camera feed (all 8)** with one in-feed ad after the 2nd image; incidents near the place and travel times below; a Feed / Map switch |
| **Weather** | Rain radar (animated) + flood circles | "No rain at ION Orchard · Partly cloudy until 2 pm" | Rain now, next 2 hours, 4-day strip (flood alerts only when active) |

### 6.5 Global rules

- **Back (Android, predictive back):** closes in order: open sheet/overlay → search → detail → full sheet to half → any other tab returns to Parking → exit. Same back stack as SG BusXing.
- **Deep links** (Later): `sgcarbuddy://carpark/{id}`, `…/charger/{id}`, `…/parked`. Used by notifications and shortcuts in v1 (internal).
- **Wide screens (≥ 840 dp):** nav rail on the left, a 400 dp side panel instead of the bottom sheet, map on the right.
- **Settings:** from the ⋮ in the search pill on every tab.

---

## 7. Core User Flows

### 7.1 First launch (about 20 seconds, skippable)

1. **Welcome:** one line ("Parking, charging, roads and rain, in one map"), plus a note: "Please don't use the app while driving."
2. **Your vehicle:** three big cards: **Car**, **Electric car**, **Motorcycle**. Electric car asks for the plug: **Type 2 (AC)**, **CCS2 (DC)**, **CHAdeMO**, multi-select, with "Not sure" = all. Electric car turns the **EV tab** on; Car and Motorcycle leave it off (Settings → Show EV tab). Changeable in Settings.
3. **Location:** "Use my location" (asks for permission now, from a user tap) or "Search instead".
4. You land on Parking: map + sheet. If location was denied: a Singapore overview with the search pill focused-ready and an inline "Turn on location" chip.
5. A one-time pin legend appears on the first map view: green "plenty", amber "limited", red "few/full", grey "no live data".

### 7.2 Find parking near a destination (the main job)

1. Tap **Where to?** → full-screen search: Saved places (Home, Work…), Recent, then live results as you type.
2. Results are grouped: **Places** (OneMap: buildings, malls, postal codes, HDB blocks) and **Carparks** (local name and number match).
3. Pick "ION Orchard" → the map flies there, a place pin drops, and the chip reads "📍 ION Orchard ✕".
4. The sheet rises to half: carparks within about 10 min walk, sorted by **walk time to ION**. Each row: name, walk time, free lots (of total), est. cost for your stay.
5. Adjust **Stay: 2 h** → est. costs update. Sort **Cheapest** → pins switch to showing est. cost.
6. Tap a carpark → **Carpark detail** → **Navigate** opens Google Maps / Waze with the carpark's entrance coordinates.

### 7.3 Parking near me

The same flow without searching. The place is Near me, and walk time reads "from you". The list refreshes every 60 s while it is visible.

### 7.4 I've parked

1. Tap **I've parked here** in Carpark detail, or tap **Parked** in the map's overflow to use the nearest carpark or the GPS point.
2. Parked sheet: carpark (prefilled), **Deck / lot** note (e.g. "4B, near lift C"), the time (now, editable), and reminder options:
   - **Before the rate changes** (e.g. Central Area 5 pm → cheaper), **before free parking ends** (Sun/PH 10:30 pm), **before the night cap starts or ends**: shown only when they apply to this carpark today.
   - **Custom:** "Remind me in 1 h / 2 h / at 6:00 pm", lead time 10 min.
3. Saving asks for notification permission (Android 13+) only if a reminder is chosen, explained in one line.
4. The **Parked mini-bar** appears above the nav on every tab: "🅿 Blk 109 Teck Whye · 1 h 12 m · est. $1.44 ›".
5. **Find my car:** the map pin plus "Walk there" (hands off to Google Maps walking).
6. **Done parking:** ends the session, cancels reminders and shows the final est. cost.

### 7.5 Charging

1. EV tab: pins show free/total connectors that fit **my plugs**.
2. Filters (Available now, DC only, 50 kW+…) apply live.
3. Charger detail: each connector's status, kW, price, lot position, operating hours. **Navigate**. "Open {operator} app" is shown only when we have a verified store link (Later).

### 7.6 Checkpoint check before a Johor trip

Roads tab → the feed opens with all 8 cameras; the Woodlands group header shows "BKE 14 min" and its three images (Causeway, Checkpoint, BKE flyover) → tap a camera for the full-screen viewer (swipe between cameras, auto-refresh, timestamp).

### 7.7 Will it rain where I'm going?

Search the destination (or keep Near me) → Weather tab → "Raining near ION Orchard now · Thundery showers until 4 pm" → radar animates the last hour over the same map.

### 7.8 Saved places

- ★ on a search result or long-press on the map → "Save place" → name it Home, Work or custom.
- Saved places appear first in search, and as quick chips under the search pill when it is focused.
- Tapping a saved place sets it as the place. No more steps.

---

## 8. Screen Specifications (layout-independent)

### 8.1 Map shell (all tabs)

```text
┌────────────────────────────────────────┐
│ ┌────────────────────────────────┐ ┌─┐ │
│ │ 🔍 Where to?                    │ │⋮│ │  search pill (56 dp), ⋮ = settings
│ └────────────────────────────────┘ └─┘ │
│ (◉ Near me)                    ☁ 31°   │  place chip · weather mini (tap → Weather)
│                                        │
│        [12]      [P 245]               │
│              [P 3]     [P 88]          │  lots pins (Parking tab)
│   [P —]           📍                   │
│                              ┌──┐      │
│                              │◎ │      │  my location / recenter
│                              └──┘      │
├──────────────── ═══ ───────────────────┤  sheet handle
│ 18 carparks near you · ● 1 min ago     │  peek (about 132 dp)
│ [Nearest ▾] [Stay 1 h ▾] [Filters 2]   │
├────────────────────────────────────────┤
│ 🅿 Blk 109 Teck Whye · 1h 12m · $1.44 › │  parked mini-bar (only when parked)
├────────────────────────────────────────┤
│ 🅿 Parking   ⚡ EV   📷 Roads   ☁ Weather │  bottom nav (64–80 dp)
├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤  non-clickable divider
│              ad banner                  │  root tabs only, collapses on no-fill
└────────────────────────────────────────┘
```

- **Search pill:** always visible. Tapping opens full-screen Search (§8.6).
- **Weather mini-chip** (temperature + rain icon at the place): a shortcut to the Weather tab. Hidden on the Weather tab.
- **Map controls:** my location (◉, filled when following); "Search this area" pill after a pan or zoom of more than about 300 m; attribution (OpenFreeMap / OSM / data sources), compact, collapsing after 5 s like SG BusXing.
- **Sheet snap points:** **peek** (summary + controls), **half** (about 50%), **full** (the map stays 72 dp visible at the top). Drag, fling and tap-on-handle all work. The sheet's scroll hands off to the drag at the top of the list.
- **Selected state:** tapping a pin enlarges it, opens the sheet at half and scrolls to that row, highlighted. Tapping a row flies to its pin (300 ms). Selection syncs both ways.
- **Long-press on the map:** "Set as place" · "Save place" · "Parked here".

### 8.2 Parking: list and pins

**Pin anatomy** (SDF/canvas images in a MapLibre symbol layer):

- A rounded pill with a "P" glyph and the **free lots for my vehicle** (`245`, `999+`, `0`, `—`).
- **Colour = availability level** (§11.2): green / amber / red / grey (no live data). Selected pins are larger with an outline.
- **Sort = Cheapest:** the label becomes est. cost (`$1.20`, `Free`, `—`) and the colour still shows availability.
- **Zoom < 14:** clusters showing "12 · 1.2k lots".
- Full carparks keep their pin (red `0`) but get lower collision priority.

**List row:**

```text
┌────────────────────────────────────────────┐
│ Blk 109/117 Teck Whye Ln            ★      │  title case, 2 lines max
│ HDB · Multi-storey · 3 min walk to ION     │  agency · type · walk
│ ▇▇▇▇▇▇▇▇▁▁  245 free of 300   est. $2.40  │  fill bar · lots · est. for stay
│ ⚡ 6 chargers · Free Sun/PH · Night ✓       │  up to 3 fact chips
└────────────────────────────────────────────┘
```

- **Est. cost** is "est. $2.40 for 2 h" in the detail; the list shows "est. $2.40" plus the stay chip in the header. When no rate is known: "—" with a "Rate not published" note in the detail.
- **Fact chips** (at most 3, by relevance): ⚡ chargers, Free now / Free Sun & PH, Night parking, Covered, Height 2.1 m (only if < 2.15 m, as a warning), Electronic.
- **Header controls:** Sort (Nearest · Most space · Cheapest), Stay (30 min · 1 h · 2 h · 3 h · 4 h · Overnight), Filters (count badge). Active filters are listed under them as removable chips.
- **Empty:** "No carparks with space within 10 min walk" → "Show full carparks" / "Widen to 20 min walk".
- **Freshness:** "● Live · 1 min ago". After more than 5 min: muted "Updated 7 min ago" plus Retry.

### 8.3 Carpark detail (ad-free, pushed screen)

```text
← Blk 109/117 Teck Whye Ln            ★  ⤴
  HDB · Multi-storey · CK1                         carpark code shown small
  3 min walk to ION · 1.2 km from you

  ┌──────────────────────────────────────┐
  │  245  car lots free      of 300      │  big number, tabular
  │  ▇▇▇▇▇▇▇▇▁▁                ● 1 min ago│
  │  Motorcycle  32 free of 40           │  other lot types, smaller
  └──────────────────────────────────────┘

  [ ➤ Navigate ]   [ 🅿 I've parked here ]          primary + secondary

  Price  (est. for 2 h: $2.40)
   Now        $0.60 per 30 min
   Free       Sun & PH 7 am – 10:30 pm
   Night      $5 cap, 10:30 pm – 7 am
   Day cap    $12 (7 am – 7 am)
   Electronic parking, charged per minute
   HDB rates as of 26 Oct 2026 · hdb.gov.sg

  Details
   Type        Multi-storey (covered)   Decks  8
   Height      2.15 m max               Basement  No
   System      Electronic               Agency  HDB

  EV chargers here (nearby match)
   ⚡ Charge+ · 6 × Type 2 7.4 kW · 3 free   ›

  Report a problem
```

- **Rates section:** only official, current rules (§11.3). It always shows its basis and the "as of" date. For malls (LTA agency): "Rates vary. Check the signs at the entrance."
- **Height:** a warning style when below 2.15 m (the common HDB gantry height). The same constant drives the list chip.
- **Navigate:** uses the default app from Settings (Google Maps / Waze / Ask each time).
- **Share:** a plain-text name, address and Google Maps URL.

### 8.4 EV: pins, list, detail

- **Pin:** a ⚡ pill with **"3/6"** (free / total connectors that fit my plugs). Green if ≥ 1 free, red if all occupied, grey if out of service or unknown.
- **List row:**

```text
┌────────────────────────────────────────────┐
│ Blk 135A Teck Whye Lane             ★      │
│ Charge+ · 4 min walk                       │
│ Type 2 · 7.4 kW AC    3 of 3 free   $0.65/kWh │
└────────────────────────────────────────────┘
```

- **Detail:** location name and address, operator, operating hours, then a **connector table**. Each connector: plug, AC/DC, kW, price + price type, position ("L1 Lot 123"), status (Available / In use / Out of service). It also shows "Updated 3 min ago" (5-min feed), Navigate, and the carpark under it (if matched).
- **Filters:** Available now · Plug type (preset from profile) · AC/DC · Min power (7 / 22 / 50 / 100 kW+) · Operator (normalised brand names, searchable multi-select).
- **Status words:** "Available", "In use", "Out of service". The raw codes are never shown.

### 8.5 Roads (camera feed first)

```text
Sheet (full by default on this tab):
  Traffic cameras · All 8 LTA cameras · 5:36 pm        [Feed | Map]
  WOODLANDS                                   BKE → checkpoint 14 min
   [ 2701 Woodlands Causeway (towards Johor) ]  16:9 image + name + time
   [ 2702 Woodlands Checkpoint              ]
   [ AD · in-feed, about camera-image size  ]  ← exactly one, after the 2nd camera
   [ 2704 BKE · Woodlands Flyover           ]
  TUAS                                        AYE → checkpoint 9 min
   [ 4703 Second Link ] [ 4712 AYE Tuas Ave 8 ] [ 4713 Tuas Checkpoint ]
  SENTOSA
   [ 4798 Sentosa Tower 1 ] [ 4799 Sentosa Tower 2 ]
  Near ION Orchard (2)                                       ›
   ⚠ Accident · Orchard Rd towards Tanglin · 0.8 km   (LTA message verbatim)
  Expressway travel times                                    ›
  Flood alerts (shown only when active)
```

- **All 8 cameras are always listed** (every camera LTA publishes; unknown new IDs appear as "Camera {id}"). The layout (single column, two-column wall or full-width stream) comes from the chosen concept.
- **In-feed ad:** exactly one, placed after the 2nd camera, about the size of a camera image (AdMob inline adaptive banner or native ad), labelled "Ad", with normal spacing so it can't be mistaken for, or tapped instead of, a camera (§15).
- **Camera viewer** (pushed, ad-free): full-screen image, pinch-zoom, swipe between all 8 cameras, "Taken 10:42:15 pm", auto-refresh every 60 s while visible, a manual refresh, and "Image unavailable" with the last image muted.
- **Map** (Feed / Map switch): camera icons (tap → viewer), incident icons by type, flood alert circles (PUB broadcast radius, labelled "alert area", not the flood extent), faulty-light icons.
- **Incidents:** sorted by distance to the place. The LTA message is shown word for word. Type icon + label.

### 8.6 Weather (kept lean, review 1)

- **Map:** the NEA 70 km radar image as a MapLibre `image` source, 50–70% opacity. The **last 12 frames** (60 min) loop. The control shows play/pause, a scrubber and the frame time ("5:40 pm"), with a light → heavy legend.
- **Sheet: three things only.**
  1. **Rain now at the place** (gauge rule from SG BusXing: ≥ 0.2 mm in 5 min within 3 km), with the temperature.
  2. **Next 2 hours** (NEA area forecast, verbatim, with its window).
  3. **Next 4 days** as one compact strip (icon + temperature range).
- **Flood alerts** appear only when one is active near the place (as a banner on every tab, and in Roads).
- **Cut from v1:** the 24-hour regional forecast (v1.1). Source line at the bottom.
- **Weather mini-chip** on the other tabs: rain icon + temperature at the place; tap opens this tab.

### 8.7 Search (full screen)

- Field: "Search place, postal code or carpark". A back arrow on the left, clear on the right.
- Before typing: **Near me** row, **Saved places**, **Saved carparks / chargers** (with live lots), **Recent** (8, clearable).
- While typing (debounce 300 ms, from 2 characters): **Places** (OneMap: building name, block + street, postal code) and **Carparks** (local fuzzy match on name, block and carpark code, e.g. "CK1").
- A 6-digit input is treated as a postal code first.
- Picking a result sets the place and returns to the map at sheet half.

### 8.8 Parked car

- **Parked sheet:** carpark (changeable), deck/lot note, start time, reminders (§7.4), Save.
- **Parked screen** (from the mini-bar): big timer, est. cost so far and the basis, upcoming reminder times, map snippet, **Walk there**, **Edit**, **Done parking**.
- The mini-bar is always above the nav while parked, on all four tabs.

### 8.9 Settings

- **Vehicle:** Car / Electric car (plugs) / Motorcycle.
- **Tabs:** **Show EV tab** (on/off). Default on for Electric car, off for Car and Motorcycle. Turning it off leaves Parking · Roads · Weather; EV chargers stay visible inside Carpark detail.
- **Navigation app:** Google Maps / Waze / Ask each time.
- **Appearance:** Auto / Day / Night (Day = A · Kerb look, Night = C · Night Drive look; same layout).
- **Walking pace:** Relaxed / Normal / Brisk.
- **Notifications:** the real OS state. When blocked: a disabled row with **Turn on notifications** (opens app settings). Reminder lead time (5 / 10 / 15 min). Exact-alarm status on Android 14+ (§12.6).
- **Saved:** manage saved places, carparks, chargers.
- **About:** privacy & ads consent, data attribution with the Singapore Open Data Licence link, "Not affiliated with LTA, HDB, URA, NEA or PUB", licences, version.

---

## 9. Design Direction: concept boards (round 1 done)

Open **`docs/design/concepts/index.html`** (chooser, comparison, recommendation). Each board shows the same four screens (**Parking, EV, Roads, Weather**) at Teck Whye, in light and dark, with real HDB lots, real LTA camera images (26 Oct 2026, 5:36 pm) and a real NEA radar frame. EV, prices and the parked session are sample data.

| Concept | Board | Idea | Roads camera layout |
|---|---|---|---|
| **A · Kerb** | `concept-a-kerb.html` | Calm, familiar, Google-Maps-like; white floating controls, one blue accent, M3 nav; big lots block in each row | Single-column cards, ad card after the 2nd |
| **B · Gantry** | `concept-b-gantry.html` | Original road-sign style: black plates with a yellow P, tall condensed numerals, departure board for checkpoint times | Two-column "camera wall" (all 8 at once), full-width ad row after the first two |
| **C · Night Drive** | `concept-c-night-drive.html` | Dark-first navy map, frosted glass, glowing orbs, ring gauges, floating sheet and pill nav | Full-width stream with frosted captions, ad after the 2nd |

Renders: `docs/design/concepts/renders/*.jpg`. Map backgrounds are static OpenFreeMap renders (`assets/maps/`), pins are placed at real projected coordinates.

**Recommendation:** B · Gantry as the base (most glanceable and distinctive; the camera wall shows all 8 with one short scroll), optionally with A's softer list rows. **Next:** the owner picks a direction or a mix, we lock one screen, then wireframe every screen (search, carpark and charger detail, camera viewer, parked flow, filters, onboarding, settings) before implementation.

### 9.1 Chosen direction: Day (A · Kerb) + Night (C · Night Drive)

One layout, two looks. Components, positions, sizes and behaviour are identical; only design tokens change.

| Element | Day (from A) | Night (from C) |
|---|---|---|
| Map style | OpenFreeMap Liberty | OpenFreeMap Fiord (navy), OSM POIs hidden |
| Canvas / surfaces | `#f3f5f8` / white | `#060a14` / frosted glass `rgba(13,19,35,.74)` + blur (solid fallback on low-end devices) |
| Accent | Blue `#1a56db` | Cyan → violet gradient `#4be3ff → #8b7bff` |
| Availability | `#0d9a55` / `#d97c00` / `#dc3439` / grey | `#2ff59a` / `#ffc94a` / `#ff5c7a` / grey, with a soft glow |
| Pins | White pill, coloured P tile, free lots | Same pill shape on dark glass, coloured P tile, subtle glow |
| Type | Figtree (UI); tabular figures | Same Figtree for layout parity; Space Grotesk only for big numerals |
| Nav, sheet, rows, chips | A's shapes | Same shapes, Night tokens |

- **Settings → Appearance:** Auto (follows the phone) / Day / Night. The ☀/☾ button on the map sets Day or Night directly; Settings can return to Auto.
- Glow and blur are decoration only: colour + number + label always carry the meaning. `prefers-reduced-transparency` / low-end devices get solid surfaces.

### 2026 UX patterns we use

- **Material 3 Expressive** (Android 16): springy, physics-based motion for the sheet and pins; larger touch targets; a shape-rich, flexible nav bar. Used with restraint.
- **Edge-to-edge** (required when targeting Android 15+): map behind the status bar, safe-area insets on the controls.
- **Predictive back** with the in-app back stack (§6.5).
- **Persistent bottom sheet over a map** with snap points: the standard for maps apps.
- **Contextual, not modal:** permission asks only from taps; one-time inline legends instead of a tour.
- **Themed (monochrome) app icon** and a splash screen from the same mark (SG BusXing brand pipeline).
- **v1.1:** Android 16 **Live Updates** (progress-style ongoing notification) for the parked timer; home-screen widget; app shortcuts ("Parking near me", "Find my car", "Cameras").

---

## 10. Design System Foundations (rules for any concept)

- **Numerals:** tabular figures for lots, minutes, prices and times.
- **Availability scale** (§11.2): Plenty (green), Limited (amber), Few/Full (red), No live data (grey). Encoded as colour **plus** the number **plus** an accessible label. A fill bar is added when the total is known.
- **Agency badge:** neutral text badge (HDB / URA / Mall). Never official logos.
- **Status words:** EV "Available / In use / Out of service"; Roads incident types from LTA's list, each with its own icon.
- **Live vs estimated vs stale:** a live dot for fresh feeds; the "est." prefix for computed cost; muted plus an age label for stale data; "—" for unknown.
- **Icons:** one outline family, 24 px grid, 1.8 stroke (SG BusXing `Icon.tsx` set, extended with P, ⚡ plug, camera, incident types, radar, car, motorcycle).
- **Layout:** 4 px grid, 16 px gutters, 48 × 48 dp touch targets (M3), safe areas.
- **Motion:** 150–250 ms functional transitions; the sheet uses spring physics; no looping animation except the radar (which can be paused). `prefers-reduced-motion` stops the radar autoplay.
- **Map styles:** OpenFreeMap Liberty (light) and the SG BusXing `nightify()` recolour (dark). Hide OSM parking and fuel POIs that would compete with our pins (same approach as `hideOsmBusStops`).
- **Accessibility:** WCAG 2.2 AA. 200% font without losing the name, lots or est. cost. Every pin has a TalkBack label. The list is a full alternative to the map (everything doable without it).

**Example TalkBack label (carpark):**

> "Blk 109 Teck Whye Lane, HDB multi-storey carpark. 245 car lots free of 300. 3 minutes' walk to ION Orchard. Estimated $2.40 for 2 hours. Updated 1 minute ago."

---

## 11. Data Semantics and Derived Values

Every derived value is a **pure, unit-tested function**. Missing inputs mean no value, never a guess.

### 11.1 Carpark identity and merge (Worker, daily catalogue)

| Source | Gives | Key |
|---|---|---|
| LTA `CarParkAvailabilityv2` (1 min, 500 rows/page) | `CarParkID`, `Area`, `Development`, `Location` ("lat lng"), `AvailableLots`, `LotType` (C/H/Y), `Agency` (HDB/LTA/URA) | `Agency + CarParkID + LotType` |
| data.gov.sg HDB Carpark Information (`d_23f946fa557947f93a8043bbef41dd09`, 2,273 rows) | address, SVY21 x/y, `car_park_type`, `type_of_parking_system`, `short_term_parking`, `free_parking`, `night_parking`, `car_park_decks`, `gantry_height`, `car_park_basement` | `car_park_no` = HDB `CarParkID` |
| data.gov.sg HDB carpark-availability (v1, 1 min) | `total_lots` + `lots_available` per `lot_type` (C/H/Y/S) | `carpark_number` |
| URA Data Service `Car_Park_Details` (daily, AccessKey + daily Token) | `ppCode`, `ppName`, `vehCat`, time bands, `weekdayRate`/`satdayRate`/`sunPHRate` + `*Min`, `parkCapacity`, `parkingSystem`, SVY21 geometry | `ppCode` = URA `CarParkID` (**verify**) |

- **Lot types:** C = car, Y = motorcycle (URA uses M; map it to Y), H = heavy (ignored in v1), S = motorcycle with sidecar (ignored). Unknown types are ignored, never mapped by guessing.
- **Covered** = HDB `car_park_type` in {MULTI-STOREY, BASEMENT, COVERED, MECHANISED…} or `car_park_basement = Y`. The type list is pinned in a table and unit-tested.
- **LTA (mall) carparks** cover only Orchard, Marina, HarbourFront and Jurong Lake District. They have no total lots and no rates in v1.
- SVY21 → WGS84 conversion happens once, during the catalogue build (pure function, tested against OneMap reference points).

### 11.2 Availability level (for my vehicle's lot type)

| Level | Rule (free lots for my vehicle) | Pin |
|---|---|---|
| Plenty | ≥ 30 | green |
| Limited | 10–29 | amber |
| Few | 1–9 | red |
| Full | 0 | red, low priority |
| No live data | no row for this lot type, or older than 15 min | grey "—" |

These are absolute counts, because a driver needs one lot, not a percentage. They are tunable constants. The fill bar uses free/total only when the total is known.

### 11.3 Rates and "est. cost for stay"

- **HDB** (rule-based, bundled as a versioned `rates/hdb-YYYY-MM.json` with a source URL and "verified on" date):
  - Car: $0.60 per 30 min. The **16 Central Area carparks**: $1.20 per 30 min Mon–Sat 7 am–5 pm, otherwise $0.60.
  - **Peak-hour pricing** at the listed carparks ($0.80 / $1.40 per 30 min; the daily caps don't apply). **(verify the list at build)**
  - Night Parking Scheme cap $5 (10:30 pm–7 am) where `night_parking = YES`. Whole-day caps $12 outside / $20 inside the Central Area.
  - Free Parking Scheme on Sundays and public holidays 7 am–10:30 pm where the `free_parking` field says so (parsed by a tested parser of the field text).
  - Motorcycle: $0.65 per lot for the day, $0.65 for the night.
  - Electronic parking is charged per minute (15-min grace period).
- **URA:** from `Car_Park_Details` per `vehCat` and time band. Apply weekday, Saturday or Sunday/PH rates with their minimum units.
- **LTA / malls:** no rate. Cost shows "—"; "Cheapest" sorts unknowns last.
- **Public holidays:** bundled MOM list (data.gov.sg dataset), versioned. Treated as Sunday.
- **Estimator:** `estimateCost(carpark, vehicle, start, durationMin, holidays)` walks the stay in rate bands, applies grace, caps and free windows, and returns `{ amount, basis[], confidence: 'rule' | 'none' }`. Shown as "est. $X". The detail shows the basis lines.
- **Rule-change reminders** (Parked) come from the same band boundaries.

### 11.4 EV chargers

- **Source:** `GET /EVCBatch` (all island, refreshed every 5 min). It returns a pre-signed S3 link. The guide says 15 min but the sample shows 5 min (`X-Amz-Expires=300`), so the Worker downloads it immediately.
- **Shape (from the sample):** `{ value: { evLocationsData: [...] } }`; numbers arrive as strings; `price` and `priceType` may be blank.
- **Field-name conflicts between the guide and the sample** (`longtitude`/`longitude`, `operationHours`/`operatingHours`): the normaliser accepts both.
- **Connector status:** `1` → Available, `0` → In use, `""` → Out of service. A location is "free" if any **compatible** connector is Available.
- **Plug compatibility:** a profile plug ↔ `plugType` mapping table (Type 2, CCS2, CHAdeMO; unknown strings → shown, not matched).
- **kW:** from `chargingSpeed` (`powerRating` is "AC"/"DC").
- **Operator names:** a normalisation table ("CHARGE+ PTE. LTD." → "Charge+"). Unknown operators → title case with "Pte. Ltd." removed.
- **Price:** "$0.65/kWh" or "$X/h" with GST included; blank → "Price not published".

### 11.5 EV ↔ carpark match (shown in detail)

A charger location is linked to a carpark when the distance is ≤ 80 m **and** the block number or postal code matches (normalised address tokens). Shown as "EV chargers here (nearby match)". There is no link when the match is ambiguous.

### 11.6 Walk time and distance

- Walk minutes from the place: `ceil(haversine × 1.3 ÷ pace)` (SG BusXing rule, pace 75 m/min by default), clamped to 1–30 min.
- Distance from the user (when a destination is chosen): straight-line km, labelled "km away" (not driving distance).
- "Nearby" radius: 10 min walk. If fewer than 5 results, widen to 20 min automatically and say so.

### 11.7 Freshness and polling

| Feed | Upstream | Worker fresh TTL | Client poll (while visible) | Stale after | Unavailable after |
|---|---|---|---|---|---|
| Carpark availability | 1 min | 60 s | 60 s (Parking tab, or a saved carpark visible) | 5 min (muted) | 15 min (grey "—") |
| EV | 5 min | 240 s | 120 s (EV tab) | 15 min | 30 min |
| Cameras | 1–5 min | 60 s | 60 s (Roads or viewer) | image timestamp > 10 min | — |
| Incidents / faulty lights | 2 min | 120 s | 120 s (Roads) | 10 min | 30 min |
| Travel times | 5 min | 300 s | 300 s | 15 min | 30 min |
| Flood alerts | 2–3 min | 120 s | 120 s (any tab, banner) | 10 min | 30 min |
| Rain / 2-hr | 5 / 30 min | 300 s | 300 s | 45 min (SG BusXing rule) | — |
| Radar frames | 5 min | 300 s (index); frames immutable | 300 s (Weather) | 20 min | — |
| Catalogue | daily | 24 h | on launch if older than 24 h | — | — |

- Polling pauses when the app is hidden, backs off on errors and keeps the last good data (SG BusXing `usePoll`).
- **Never show stale data as live:** no "Plenty" from a feed older than 15 min.

### 11.8 Rain and radar

- **Rain now and 2-hr:** reuse SG BusXing `rainStatus()` unchanged, but use the **place** (destination or GPS) instead of GPS only.
- **Radar:** `GET api-open.data.gov.sg/v2/real-time/api/weather-radar-images/70km`. It returns one record with a signed PNG URL (20 min expiry) and a bounding box in EPSG:4326 (upper-left 103.3427, 1.9785; lower-right 104.6023, 0.7195). Past frames come from `?date=…` (verified).
  - The Worker builds the last 12 frame list and proxies PNGs at stable URLs (`/v1/weather/radar/{yyyyMMddHHmm}.png`), cached as immutable.
  - The image is an azimuthal-equidistant projection placed into a lat/long box. The distortion is small at 70 km, so it is accepted and noted in the legend ("approximate position").

### 11.9 Roads

- **Cameras:** `Traffic-Imagesv2` has only `CameraID`, lat/long and `ImageLink`. Names come from **Annex G** (8 cameras as of v6.10):

| CameraID | Name (LTA Annex G) | Group |
|---|---|---|
| 2701 | Woodlands Causeway (Towards Johor) | Woodlands |
| 2702 | Woodlands Checkpoint | Woodlands |
| 2704 | BKE (Woodlands Checkpoint) – Woodlands Flyover | Woodlands |
| 4703 | Tuas Second Link | Tuas |
| 4712 | AYE (Tuas) – Tuas Ave 8 Exit | Tuas |
| 4713 | Tuas Checkpoint | Tuas |
| 4798 | Sentosa Tower 1 | Sentosa |
| 4799 | Sentosa Tower 2 | Sentosa |

  Unknown IDs (if LTA adds cameras back) are shown as "Camera {id}" at their location, never hidden.
- **Image links expire** (guide says 5 or 15 min): never store them. The Worker returns fresh links every 60 s.
- **Incidents:** `Type`, lat/long, `Message` (verbatim). Ordered by distance to the place, then recency.
- **Travel times:** `EstTravelTimes` (`Name`, `Direction`, `StartPoint`, `EndPoint`, `EstTime`). Checkpoint cards use the BKE/AYE segments ending at the checkpoints (mapping table, **verify** segment names in the live data).
- **Flood alerts:** match `Cancel` messages to `Alert`s by `alertId`/area/time. Show only active ones. The circle is the **broadcast radius**, labelled as such.
- **Faulty lights:** `v2/FaultyTrafficLights` gives SVY21 X/Y → converted to WGS84 in the Worker.

---

## 12. Technical Architecture

### 12.1 Reuse from SG BusXing (fork, don't share yet)

Copy these and adapt. Extract a shared package only if both apps keep diverging copies after v1.

| From SG BusXing | Use here |
|---|---|
| Repo layout `mobile/ worker/ shared/ site/ docs/` | Same |
| React 19 + TS 5.9 + Vite 8 + Capacitor 8, no router, Context + `usePoll` | Same |
| `lib/hooks/poll.ts`, `location.ts`, `platform.tsx` (theme, back stack), `boot.ts` | As-is |
| `components/NearbyMap.tsx` + `mapStyle.ts` (OpenFreeMap Liberty, `nightify`) | Base for the shared map shell |
| `lib/domain/rain.ts`, `geo.ts`, `shared/nea.ts`, `RainDetails` | As-is, with the place instead of GPS |
| `shared/onemap.ts` + Worker `onemapAuth()` + `/v1/places` | As-is |
| Worker `cached()` (memory → Cache API → coalescing → last-good), CORS, rate limiter, `HttpError` | As-is |
| `scripts/setup.mjs`, `usage.mjs`, `dev-node.ts`, `check-release.mjs`, `create-keystore.sh`, brand pipeline, `site/` privacy builder | Renamed |
| Demo mode (empty `VITE_API_BASE_URL`) | Same, with demo carparks, chargers, cameras and radar |

### 12.2 New client pieces

- **Persistent map shell:** one MapLibre instance; layer sets per tab; GeoJSON sources with `cluster: true` and `clusterProperties` (sum of lots); pins as runtime-generated images (`map.addImage`) in **symbol layers** (not DOM markers), because there are 2,000+ points.
- **Draggable non-modal bottom sheet** with three snap points and scroll handoff. Custom (pointer events + CSS transforms, about 250 lines) or a small library, decided at scaffold after a quick spike on a low-end phone.
- **Rates engine** (`lib/domain/rates/`), **EV normaliser and compatibility** (`lib/domain/ev.ts`), **availability level** (`lib/domain/availability.ts`).
- **Catalogue store:** IndexedDB (via a small wrapper) for the carpark catalogue (about 400 KB) with an ETag; Capacitor Preferences for prefs, saved items and the parked session.
- **Capacitor plugins:** `@capacitor/geolocation`, `@capacitor/preferences`, `@capacitor/app` (as in SG BusXing) plus `@capacitor/local-notifications` (reminders) and `@capacitor/share`. Later: `@capacitor/camera` (parked photo), AdMob (`@capacitor-community/admob`) + UMP.
- **Navigation handoff:**
  - Google Maps URL `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving` (or `walking` for Find my car).
  - Waze `https://waze.com/ul?ll={lat},{lng}&navigate=yes`.
  - Neither needs an API key. Opened as an external intent.

### 12.3 Worker (Cloudflare, free plan)

```text
React UI ── local stores (catalogue in IndexedDB, prefs/saved/parked in Preferences)
   │      ├─ Capacitor: geolocation, local notifications, share, AdMob/UMP
   │      └─ HTTPS /v1  (no coordinates ever sent; island-wide payloads, filtered on device)
   ▼
Cloudflare Worker ── validation · cache · coalescing · last-good · rate limit · normalise
   ├─ LTA DataMall: CarParkAvailabilityv2, EVCBatch, Traffic-Imagesv2, TrafficIncidents,
   │                EstTravelTimes, v2/FaultyTrafficLights, PubFloodAlerts
   ├─ data.gov.sg: HDB carpark info (daily), HDB carpark-availability (totals),
   │               rainfall, 2-hr / 24-hr / 4-day, radar 70 km, flood alerts, public holidays
   ├─ URA Data Service: daily token → Car_Park_Details (daily)
   └─ OneMap: search (token)
   Cron (1 of 5 free): daily catalogue build → KV (1 write/day)
```

### 12.4 HTTP interface (v1)

| Endpoint | Purpose | Cache (fresh / last-good) |
|---|---|---|
| `GET /v1/health` | Status + which keys are configured | no-store |
| `GET /v1/carparks/catalog` | Merged static catalogue (id, agency, name, lat/lng, type, covered, system, decks, height, basement, free/night parking, total lots, rate ref / URA bands). ETag + version | 24 h / 7 d |
| `GET /v1/carparks/availability` | Island-wide compact snapshot: `[id, cFree, cTotal?, yFree, yTotal?]` + `fetchedAt` | 60 s / 1 h |
| `GET /v1/ev` | Island-wide EV locations with compact connectors | 240 s / 1 h |
| `GET /v1/roads/cameras` | 8 cameras: id, name, group, lat/lng, fresh image URL, timestamp | 60 s / 10 min |
| `GET /v1/roads/incidents` | Incidents + faulty lights (WGS84) | 120 s / 1 h |
| `GET /v1/roads/travel-times` | Normalised `EstTravelTimes` | 300 s / 1 h |
| `GET /v1/alerts/flood` | Active PUB flood alerts | 120 s / 1 h |
| `GET /v1/weather/rain` | As SG BusXing, plus air-temperature stations (5 min) for the weather mini-chip | 300 s / 3 h |
| `GET /v1/weather/outlook` | 24-hr + 4-day | 30 min / 6 h |
| `GET /v1/weather/radar` | Last 12 frame times + bbox | 300 s / 1 h |
| `GET /v1/weather/radar/{ts}.png` | Proxied radar frame | immutable |
| `GET /v1/places?q=` | OneMap search (as SG BusXing) | 24 h / 7 d |

Every JSON response includes `serverTime`, `fetchedAt` and `stale`. Schemas are frozen with contract tests and fixtures before client integration.

### 12.5 Free-plan budget and risks

| Limit (Workers Free) | Our use | Notes |
|---|---|---|
| 100,000 requests/day | About 25 per daily user (availability every 60 s while Parking is open, EV, rain, places) → **about 3,000–4,000 daily users** | `npm run usage` alarms at 70%. Paid plan is US$5/mo |
| 10 ms CPU per request / cron | Availability: about 8 DataMall pages + HDB totals → slim array. **EVCBatch file size unknown** | **Phase 1 spike:** measure CPU. If over: stream EVCBatch through unparsed (cached) and normalise on device |
| 50 subrequests | Availability ≈ 8–10; radar index ≈ 12 (first build), then 1 per refresh | OK |
| KV 1,000 writes/day | Catalogue: 1/day | Never write per-minute snapshots to KV |
| Cron: 5 per account | 1 (daily catalogue) | SG BusXing uses none |
| Cache API on `workers.dev` | Docs list custom domains | **(verify)**. If it is a no-op: memory cache + coalescing still work per isolate, or use a custom domain |
| DataMall | Up to 10M calls/day per key (LTA ToS) | Register a **separate key for this app** |
| data.gov.sg | Prod key 30 calls / 10 s | Prod key in the Worker only |

Payloads (gzip, estimated): availability about 15–25 KB/min; catalogue about 80–120 KB/day; EV unknown (spike); radar frame about 20–60 KB.

### 12.6 Android specifics

- `minSdk 24`, `targetSdk 36` (as SG BusXing). Edge-to-edge, predictive back.
- **Notifications:** `POST_NOTIFICATIONS` (Android 13+) is requested only when the user picks a reminder.
- **Exact alarms:** `SCHEDULE_EXACT_ALARM` is denied by default for new installs on Android 14+, and `USE_EXACT_ALARM` is not allowed for this app category. Reminders are scheduled **inexact with allow-while-idle**, with a lead time (default 10 min). If the user wants exact timing, Settings links to "Alarms & reminders". **(verify the plugin behaviour on Android 14–16)**
- Reminders are rescheduled on boot and app update (plugin support, **verify**). The parked session lives in Preferences, so it survives process death.

---

## 13. Client Models

```ts
type Vehicle = 'car' | 'ev' | 'motorcycle';
type Plug = 'type2' | 'ccs2' | 'chademo';
type Agency = 'HDB' | 'URA' | 'LTA';
type LotType = 'C' | 'Y';              // v1; H and S ignored

interface CarparkInfo {                 // catalogue (daily)
  id: string;                           // `${agency}:${carParkId}`
  agency: Agency;
  code: string;                         // e.g. "CK1"
  name: string;                         // title-cased Development / address
  lat: number; lng: number;
  type?: 'multi-storey' | 'surface' | 'basement' | 'mechanised' | 'covered' | 'other';
  covered?: boolean;
  system?: 'electronic' | 'coupon';
  decks?: number;
  heightM?: number;                     // gantry height, 0 → unknown
  freeParking?: { days: 'sun-ph'; from: string; to: string } | null;
  nightParking?: boolean;
  totals?: Partial<Record<LotType, number>>;
  rate: { kind: 'hdb'; central: boolean; peak?: 'p080' | 'p140' }
      | { kind: 'ura'; bands: UraBand[] }
      | { kind: 'none' };
}

interface Availability {                // snapshot (60 s)
  fetchedAt: string;
  stale: boolean;
  lots: Record<string, Partial<Record<LotType, { free: number; total?: number }>>>;
}

interface EvLocation {
  id: string; name: string; address: string; lat: number; lng: number;
  operator: string;                     // normalised brand
  hours?: string;
  connectors: Array<{
    id: string; plug: Plug | string; current: 'AC' | 'DC'; kw?: number;
    price?: number; priceUnit?: 'kWh' | 'h'; position?: string;
    status: 'available' | 'in-use' | 'out-of-service';
  }>;
}

interface Place {
  kind: 'near-me' | 'search' | 'saved' | 'map';
  label: string; lat: number; lng: number;
  savedId?: string;
}

interface SavedPlace { id: string; label: string; icon: 'home' | 'work' | 'star'; lat: number; lng: number; createdAt: string; }
interface SavedItem  { kind: 'carpark' | 'charger'; id: string; createdAt: string; }

interface ParkedSession {
  carparkId?: string;                   // undefined → GPS point only
  lat: number; lng: number;
  startedAt: string;
  note?: string;                        // "4B near lift C"
  reminders: Array<{ kind: 'rate-change' | 'free-ends' | 'night-cap' | 'custom'; at: string; notificationId: number }>;
}

interface Preferences {
  vehicle: Vehicle; plugs: Plug[];
  navApp: 'google' | 'waze' | 'ask';
  theme: 'system' | 'light' | 'dark';
  walkingPaceMpm: number;               // 75
  stayMin: number;                      // 60
  sort: 'nearest' | 'space' | 'cheapest';
  parkFilters: { hasSpace: boolean; covered: boolean; freeNow: boolean; night: boolean; electronic: boolean; minHeightM?: number; agencies: Agency[] };
  evFilters: { availableNow: boolean; current?: 'AC' | 'DC'; minKw?: number; operators: string[] };
  reminderLeadMin: number;              // 10
  schemaVersion: number;
}

interface CostEstimate { amount: number | null; basis: string[]; confidence: 'rule' | 'none'; }
```

---

## 14. Local State Rules

- The place persists for 2 hours; after that the app starts on Near me.
- Filters, sort and stay persist (per vehicle). Changing the vehicle resets incompatible filters (e.g. plugs).
- Saved items are stored by stable ID. If a carpark disappears from the catalogue: "No longer listed" with Remove.
- One parked session at a time. A new "I've parked" asks to replace it.
- Recents: last 8 places, clearable.
- Migrations are versioned and tested (SG BusXing pattern). Demo-mode data never mixes with live data.

---

## 15. Advertising, Privacy and Licensing

### Advertising

- Adaptive banner **below the bottom nav** on the root tabs only, behind a non-clickable divider (AdMob recommended placement, as in SG BusXing). The height is reserved, collapses on no-fill, and never covers the sheet, pins, attribution or insets.
- **One in-feed ad on Roads** (owner decision, review 1): exactly one, after the 2nd camera in the feed, about the size of a camera image (AdMob inline adaptive banner or a native ad laid out like a camera card). Clearly labelled "Ad", visually distinct from camera images, with normal spacing from tappable images. Never repeated, never inside the camera viewer. Re-check the current AdMob policies on native and inline placements before release.
- Never on: Carpark/Charger detail, Camera viewer, Search, Filters, Parked flow, onboarding, permission or alert screens.
- Test units in every non-production build. UMP consent before ad requests.

### Privacy

- **Location never leaves the phone.** Carpark availability, EV, cameras, incidents, flood alerts and rain are downloaded **island-wide** and filtered on the device. The Worker never receives coordinates.
- OneMap search sends only the typed text (via the Worker).
- Navigation handoff sends the destination to Google Maps / Waze when the user taps Navigate.
- The parked session, saved places and notes stay on the device.
- The privacy policy, Play Data Safety (location: on device, not collected; ads SDK disclosures) and later Apple labels must match the shipped SDKs.

### Attribution and licences

- **Singapore Open Data Licence v1.0** (LTA DataMall, data.gov.sg / HDB / NEA / PUB, URA): a conspicuous notice plus a link to the licence, in About and in each source line ("Source: LTA DataMall"). No implied endorsement: "Not affiliated with LTA, HDB, URA, NEA or PUB".
- **OneMap:** OneMap logo + "OneMap © contributors | Singapore Land Authority" wherever search results are shown (**verify** whether search-only use needs the logo).
- **Map:** "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".
- No official logos; agency names in text badges only.

---

## 16. Failure and Edge States

| State | Behaviour |
|---|---|
| Location denied | Singapore overview, search ready, "Turn on location" chip. Walk times only after a place is chosen |
| No search results | "No places found" + tips (postal code, block + street). Carpark-name matches still shown |
| Offline with cache | Last data muted with its age and an offline badge. Pins grey after 15 min. Search works for saved and recent places only |
| Offline, no cache | Map tiles may fail: a list-only fallback with a retry row. No full-screen error |
| Carpark has no live row for my lot type | Grey "—" pin. Detail: "No live data for motorcycles here" |
| Lots = 0 | Red "0", "Full now". Sorted after carparks with space within the same walk band |
| Rate unknown (mall) | "—" est. "Rates vary. Check the signs at the entrance." "Cheapest" sorts it last |
| EV price blank | "Price not published" |
| All connectors out of service | Grey pin, "Out of service" |
| Camera image fails or is old | Last image muted, "Image from 10:31 pm", retry |
| Only 8 cameras (or fewer) | Groups with no cameras are hidden. Unknown new IDs shown as "Camera {id}" |
| Radar frame missing | Skip the frame, keep the loop; "Radar unavailable" when the latest frame is older than 20 min |
| Flood alert near the place | Banner on every tab: "Flood alert near ION Orchard · PUB · 10:42 pm" → Roads |
| Notifications blocked | Reminder options disabled with "Turn on notifications"; the parked timer still works |
| Exact alarms not allowed | Reminder note: "may arrive a few minutes late" + link to "Alarms & reminders" |
| Upstream rate limit / timeout | Serve last-good with `stale: true`, back off, show the age |
| Map/WebGL unavailable | List-only mode (all functions except the map) |
| 200% font | Names wrap. Lots, est. cost and walk time never truncate |

---

## 17. Implementation Sequence

### Phase 0: Decisions and foundation

1. Owner: final **name** → wordmark + **application ID** (permanent after the first Play upload).
2. Owner: register keys (§21): new LTA DataMall key, URA Data Service AccessKey, data.gov.sg prod key, OneMap account. Cloudflare: reuse the account, new Worker `sgcarbuddy-api`.
3. ~~Design concept boards A/B/C~~ **done** → **A (Day) + C (Night)** chosen → freeze Day/Night tokens (§9.1). Remaining screens are designed directly in code and reviewed in the app.
4. Scaffold by copying the SG BusXing skeleton (mobile/worker/shared/site/scripts), rename, git + CI (typecheck, tests, build).

### Phase 1: Data contracts and spikes

1. **Spikes (go/no-go):**
   - `EVCBatch` file size and Worker CPU (parse vs stream-through).
   - Cache API on `workers.dev`.
   - DataMall availability page count and CPU.
   - URA `ppCode` ↔ DataMall `CarParkID` match rate.
   - Local notifications with inexact alarms on Android 14–16.
2. Catalogue build (Cron → KV): HDB info + SVY21, HDB totals, URA details + token, LTA list; covered/free/night parsers; version + ETag.
3. Availability snapshot, EV, cameras (Annex G names), incidents + faulty lights, travel times, flood, radar index + proxy, outlook, places.
4. `/v1` contract types in `shared/`, fixtures, contract tests. Demo-mode data.

### Phase 2: Map shell and Parking

1. App shell: shared map, 4-tab nav, sheet with snap points, search pill, place chip, back stack, themes.
2. Search screen (OneMap + local carpark index), saved and recent places.
3. Carpark pins (symbol layer, clustering, availability colours), list, sort, stay, filters with a live count.
4. Rates engine + est. cost; carpark detail; Navigate handoff; save ★.
5. Onboarding (vehicle, location), legends, empty/stale/offline states.

### Phase 3: EV

1. EV layer, compatibility with the profile, list, filters, detail with connectors.
2. EV ↔ carpark match in Carpark detail.

### Phase 4: Parked car

1. Parked sheet, session store, mini-bar, Parked screen, Find my car.
2. Reminders from rate bands + custom; notification permission flow; honest notification state in Settings.

### Phase 5: Roads and Weather

1. Roads: checkpoint cards, camera viewer, incidents, travel times, flood alerts and banner, faulty lights.
2. Weather: rain now + 2-hr (reuse), radar overlay with play/scrub, 24-hr, 4-day, weather mini-chip.

### Phase 6: Native, ads, release

1. AdMob test banners + UMP; icons, splash, brand pipeline; privacy site; attribution surfaces.
2. Real-device QA (low-end Android, TalkBack, 200% text, offline, process death, notifications).
3. Release: keystore, AAB, Play listing, Data Safety, closed test (≥ 12 testers × 14 days, still required for new personal accounts), production.

### v1.1 backlog

Live Updates parked notification, widget, app shortcuts, availability trend sparkline, lightning, parked photo, Parking.sg handoff, speed overlay, ERP gantries, COE card, rain-at-destination hint.

---

## 18. Test Plan

### Unit (pure functions)

- **Availability level:** thresholds, unknown, stale → grey.
- **Rates engine:**
  - HDB non-central 2 h on a weekday = $2.40.
  - Central Area crossing 5 pm.
  - Peak-hour carpark (caps don't apply).
  - Night cap 10:30 pm–7 am.
  - Sunday/PH free window, including a stay that crosses 10:30 pm.
  - Whole-day caps $12/$20.
  - Motorcycle per-lot charges.
  - Grace period.
  - URA bands with minimum units.
  - Unknown → `confidence: 'none'`.
- **Parsers:** `free_parking` texts, `car_park_type` → covered, gantry height, SVY21 → WGS84 (reference points).
- **EV:** status mapping, plug compatibility, operator normalisation, both field-name variants, string numbers, blank price.
- **EV ↔ carpark matcher:** match, ambiguous (no link), far (no link).
- **Walk time:** formula and radius widening. Place persistence (2 h).
- **Reminders:** which apply to a carpark today; lead time; past times skipped.
- **Rain:** status at the place (reuse the SG BusXing tests). Radar frame list, missing frames.
- **Flood alerts:** an Alert/Cancel pair → none active.

### Integration (Worker)

- DataMall paging, partial fields, unknown lot types.
- EVCBatch link expiry and retry.
- URA token refresh.
- Cache and last-good fallback, stale flags.
- Rate limit, CORS.
- **Keys never in responses, logs or the app bundle.**
- CPU per endpoint under 10 ms (wrangler dev measurements).

### End-to-end

1. First launch → Car → allow location → pins near me → open a carpark → Navigate opens Google Maps.
2. Deny location → search "238801" (postal code) → the place is set → list sorted by walk time to it.
3. Switch Parking → EV → Roads → Weather: map, zoom and place are kept; no reload; the sheet content changes. Turn off "Show EV tab" → 3 tabs; turn it on → EV returns in the same position.
   - Roads feed: all 8 cameras listed; exactly one ad, after the 2nd camera; no ad in the camera viewer.
4. EV profile (CCS2) → only CCS2 counts on pins → the filter "50 kW+" updates the button count.
5. I've parked → reminders → kill the app → relaunch → the mini-bar is still there → a notification arrives → Done parking cancels the rest.
6. Roads: a camera fixture with a new unknown ID → shown as "Camera {id}"; travel times; a flood fixture → banner on all tabs.
7. Weather: radar plays, pauses, scrubs; reduced motion → no autoplay.
8. Offline with cache → muted data and ages → recovery.
9. TalkBack and 200% text through all flows; light and dark; ≥ 840 dp layout.
10. Ads: never on detail, viewer, search, filters, parked flow or onboarding; the slot collapses on no-fill.

### Performance budget (low-end Android)

- Cold start to the map with pins < 3 s on a warm cache.
- Tab switch < 150 ms.
- 60 fps pan with 2,000+ pins (symbol layers + clustering).
- Sheet drag at 60 fps.

---

## 19. Acceptance Criteria

- One search field plus Near me; no origin/destination UI anywhere.
- Pins and rows show **free lots for my vehicle** with an availability colour and an accessible label; clusters at low zoom.
- Every carpark row shows walk time **to the chosen place** and an **est. cost for my stay** (or "—" with a reason).
- Rates come only from official, current rules, with the basis and the "as of" date in the detail.
- EV shows only connectors that fit my plugs, with live free/total and price. The EV tab can be hidden in Settings.
- Switching tabs keeps the map, zoom and place, with no reload.
- Parked car works offline, survives restarts and schedules honest reminders; notification state is never misrepresented.
- Roads shows every camera LTA publishes (8 today) with names and timestamps, plus incidents, travel times and flood alerts.
- Weather shows rain at the place and an animated radar over the same map.
- No coordinates are sent to the Worker; no API key is in the app.
- Stale data is never shown as live; unknown is never shown as zero.
- WCAG 2.2 AA in both themes; 200% text; TalkBack labels on pins.
- Runs on the Workers free plan with `npm run usage` monitoring.

---

## 20. Decisions Required from the Owner

**Resolved (26 Oct 2026):** map/search provider (MapLibre + OneMap), no origin/destination, 4 tabs on a shared map, Roads tab with the remaining cameras, Car + Motorcycle, v1 extras (Parked + reminders, Saved places, Rain radar), design boards after the plan review.

**Resolved (review 1, 26 Oct 2026):** tabs **Parking · EV · Roads · Weather** (bolt icon for EV); **EV tab hideable** in Settings; Roads shows **all 8 cameras** with **one in-feed ad after the 2nd camera** plus the bottom banner; Weather kept lean.

**Still open:**

1. **App name** and **application ID**: working `sgcarbuddy` / `com.sgcarbuddy.app` until confirmed (then GitHub repo + rename before the first Play upload).
2. ~~Concept~~ **Resolved:** A (Day) + C (Night), same layout, colours/style only; Auto / Day / Night setting.
3. **Default Navigate app:** Google Maps, Waze, or Ask each time (recommended: Ask on first use, then remember).
4. **Availability thresholds** (30 / 10 / 1 lots): fine for v1?
5. **Ads at launch:** banners from day one (as SG BusXing), or ad-free closed testing first?
6. **Heavy vehicles:** confirm they are out for v1 (data supports them later).

---

## 21. Owner Setup Checklist (keys and accounts)

| # | Item | Why | Where it goes |
|---|---|---|---|
| 1 | LTA DataMall AccountKey (**new registration** for this app, "Mobile APP") | Carparks, EV, cameras, incidents, travel times, flood | `worker/.env.local` → Cloudflare secret `LTA_ACCOUNT_KEY` |
| 2 | URA Data Service AccessKey (registration form) | URA rates, capacity | `URA_ACCESS_KEY` |
| 3 | data.gov.sg **production** API key | Rain, radar, HDB info/totals, outlook (30 calls / 10 s) | `DATAGOVSG_API_KEY` |
| 4 | OneMap account (email/password) | Search (token now expected) | `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` |
| 5 | Cloudflare: reuse the account; new Worker `sgcarbuddy-api`; optional custom domain if the Cache API needs it | Hosting | `npm run setup` |
| 6 | Play Console: new app, closed-test testers (≥ 12 for 14 days) | Release | — |
| 7 | AdMob: new app + banner unit | Ads | Build config |

Secrets never go in `mobile/` or any `VITE_*` variable (same rule as SG BusXing).

---

## 22. Sources (checked 26 Oct 2026)

| Topic | Source | Notes |
|---|---|---|
| LTA DataMall API User Guide **v6.10 (1 Oct 2026)** | https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf | Carpark p.33, EV p.50–53, Images p.38, Annex G p.82, Incidents p.39, Travel times p.34, Faulty lights v2 p.35, Flood p.54 |
| DataMall dynamic / static datasets | https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html · …/static-data.html | ERP rates: PDF only (API removed 30 Sep 2024) |
| DataMall API terms, Open Data Licence | https://datamall.lta.gov.sg/content/datamall/en/api-terms-of-service.html · …/SingaporeOpenDataLicence.html | 10M calls/day; attribution with licence link |
| Traffic cameras reduced to 8 | Live `https://api.data.gov.sg/v1/transport/traffic-images` (8 today; 90 on 15 Jun 2026); OneMotoring traffic cameras page | Switched off 30 Jun 2026 |
| HDB Carpark Information | data.gov.sg `d_23f946fa557947f93a8043bbef41dd09` | 2,273 rows, SVY21 |
| HDB carpark availability (totals) | `https://api.data.gov.sg/v1/transport/carpark-availability` | 2,022 carparks live today |
| HDB parking charges, Free Parking Scheme | https://www.hdb.gov.sg/parking/other-parking-matters/shortterm-parking/shortterm-parking-charges | Central Area list, peak-hour pricing, caps |
| URA Data Service | https://eservice.ura.gov.sg/maps/api/ · https://www.ura.gov.sg/eservices-info/maps/api-terms-of-service | AccessKey + daily Token |
| NEA real-time APIs | `https://api-open.data.gov.sg/v2/real-time/api/…` (rainfall, two-hr-forecast, twenty-four-hr-forecast, four-day-outlook, weather-radar-images/70km, weather?api=lightning, weather/flood-alerts) | Radar URL expires in 20 min; `?date=` for past frames |
| data.gov.sg rate limits and keys | https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits | 6 / 12 / 30 per 10 s |
| OneMap API and terms | https://www.onemap.gov.sg/apidocs/ · https://www.onemap.gov.sg/legal/apitermsofservice.html | Token valid 3 days |
| OpenFreeMap | https://openfreemap.org/ · https://openfreemap.org/tos/ | Free, attribution required |
| Google Maps Platform pricing and Places policy (why not Google) | https://developers.google.com/maps/billing-and-pricing/pricing · https://developers.google.com/maps/documentation/places/web-service/policies | Places results only on a Google map |
| Cloudflare Workers limits | https://developers.cloudflare.com/workers/platform/limits/ · …/kv/platform/limits/ | 100k req/day, 10 ms CPU, KV 1k writes/day, 5 crons |
| Play testing requirement | https://support.google.com/googleplay/android-developer/answer/14151465 | 12 testers × 14 days |

---

## 23. Implementation Status (v0.1, 27 Oct 2026)

Repository: `mobile/` (React 19 + TS + Vite 8 + Capacitor 8, app ID `com.sgcarbuddy.app`), `worker/` (Cloudflare Worker `sgcarbuddy-api`, not deployed yet), `shared/` (contract + normalisers). Pushed to https://github.com/MJLittleByte/sgcarbuddy (28 Oct 2026).

### Done and checked against live data (local Worker, BusXing keys)

| Area | What works |
|---|---|
| Shell | One persistent MapLibre map (OpenFreeMap Liberty by Day, Fiord by Night), search pill, place chip ("Near you · Choa Chu Kang" / chosen place ✕), Home/Work chips, weather chip, draggable 3-snap bottom sheet, 4-tab nav (EV hidden unless enabled), parked bar on every tab, mock banner below the nav, Android back stack, flood banner when PUB alerts are near the place |
| Day / Night | Concept A tokens by Day, concept C by Night (glass, gradient accent, glowing pins), same geometry. Settings: Auto / Day / Night; ☀/☾ quick toggle. The map remounts on a theme switch and refocuses |
| Parking | 2,404 carparks (2,273 HDB + 91 URA + 40 malls). Canvas-drawn pins with free lots for my vehicle (colour = availability), dots underneath where pins collide, nearest pins win. List: lots block (free of total), walk time to the place, up to 3 facts (season only, free now, EV chargers, low gantry, covered, free Sun/PH, night cap), estimated cost for the stay. Sort (nearest / most space / cheapest), stay picker, filters (has space, covered, free now, night cap, electronic, season-only, minimum gantry height, agency), auto-widen to 20 min walk |
| Rates | HDB rules from hdb.gov.sg (checked 27 Oct 2026): $0.60/30 min, Central Area list (16 codes) $1.20 Mon–Sat 7am–5pm, peak-hour pricing at 12 carparks with their exact windows and no caps, Night Parking Scheme $5 cap, $12/$20 day caps, Free Parking Scheme (7am or 1pm–10:30pm Sun/PH), 15-min grace, coupon half-hours, motorcycles $0.65 per day/night window. 2026–2027 public holidays from data.gov.sg. URA: per-carpark bands with a URA key, otherwise URA standard coupon rates labelled "std. rate". Malls: "—" with "Rates vary by mall" |
| Carpark detail | Big lots card (other lot type too), Navigate (Google Maps / Waze / ask + remember), I've parked here, price rules + estimate basis + source, details grid, low-gantry warning, EV chargers within 120 m, save ★, share, report a problem |
| EV | 2,805 sites / 11,724 connectors from LTA EVCBatch (normalised on the phone). Pins "free/total" for my plugs; filters: plugs, available now, DC fast, min kW, operator (brand names). Charger detail: every connector's status, plug, AC/DC, kW, price, lot position, operator; parking under it |
| Roads | **Full-screen page, no map** (changed after review, see fixes): all 8 LTA cameras first, edge to edge, grouped Woodlands / Tuas / Sentosa with LTA travel time on BKE / AYE, **one in-feed ad after the 2nd camera**, full-screen viewer (swipe between all 8, pinch/double-tap zoom, whole image never cropped, fills the screen when the phone is turned sideways); then road alerts within **4 km** of you or the searched place (incidents, faulty traffic lights, PUB floods; nearest first, LTA text without the time prefix, tap → sheet with "Show on Google Maps"); then expressway travel times |
| Weather | NEA rain radar (last hour, 12 frames, proxied by the Worker) with play/pause and scrubber; rain now at the place (gauge within 3 km), temperature, next 2 hours, 4-day strip; place-based, never sends location |
| Search | OneMap places and postal codes (via Worker), local carpark search (names, abbreviations, codes such as CK7), Near you, Home / Work (set from search), saved carparks/chargers with live lots, recents |
| Parked car | Note (deck/lot), start time (now / 15 / 30 / 60 min ago), reminders only for rule changes that apply to this carpark (free parking ends, rate up/down, night cap) plus custom 1–4 h, lead time 5/10/15 min, honest notification and exact-alarm state; timer, est. cost so far, walk to my car, done parking cancels reminders |
| Onboarding | Welcome + safety note, vehicle (Car / Electric car + plugs / Motorcycle; Electric car turns on the EV tab), location |
| Worker | `/v1/health`, `carparks/catalog`, `carparks/availability`, `ev` (pass-through), `roads/cameras`, `roads`, `weather`, `weather/radar`, `weather/radar/{ts}.png`, `places`. Memory + Cache API + coalescing + last-good, rate limit, CORS, network failures → 502 |
| Quality | 28 app tests + 19 Worker tests, strict typecheck, production build (main chunk 112 kB gzip; MapLibre and the carpark snapshot load as separate chunks), debug APK (demo mode) builds |

### Fixes after the first review (27 Oct 2026)

| Reported | Cause | Fix |
|---|---|---|
| Parking lots, EV and rain radar "unavailable" in local testing | The local Worker (Node) ignored the machine's HTTPS_PROXY setting, so every LTA / data.gov.sg call failed. Keys were fine (`/v1/health` showed both configured) | `npm run dev:node` now restarts itself with `HTTPS_PROXY` and the system's trusted certificates (`worker/scripts/node-net.ts`); the app now says *why* something is unavailable (server unreachable, data source not responding, key missing) |
| Weather map could not be zoomed out or moved; only Woodlands and Johor Bahru showed | The map was locked to Singapore at zoom ≥ 10 (already filling the allowed area), centred on the user with the panel covering the island | Weather now allows the whole 70 km radar area (zoom 8–19, pan to Johor / Riau), frames the whole island between the top bar and the radar controls, and opens with the panel low |
| Logo looked primitive / like a kids' app | First car-face mark | New **"Pin"** mark (white map pin with a bold P on a blue gradient; Google / AWS product-icon style), chosen from three directions in `docs/design/logo/index.html`; applied to launcher, themed icon, splash, loading screen, favicon and Play icon |
| Live parking data sometimes "unavailable" after a refresh (asked: restart the Worker?) | The development network dropped **every** connection when about 8 opened at once (measured: 6 at once fine, 8 → all cancelled after 5 s, curl too). A refresh fires all feeds together, so the Worker opened 8+ upstream connections and all of them failed. The Worker then served its last good copy, but the app labelled it by when the *phone* received it ("Live · updated just now"), retried only after 2 min, and forgot everything on a reload. No restart was ever needed (a restart only empties the cache) | Worker: at most 4 upstream requests in flight (also Cloudflare's 6-connection limit), one quick retry for a dropped connection, last-good copy served within 2.5 s while a slow refresh finishes in the background, DataMall pages fetched 3 at a time, timestamped dev log with the failure reason. App: "Updated …" uses the server's fetch time, failed refreshes retry after 15 s (then back off), and the last availability survives a restart (reopening in a basement still shows recent counts; anything over 15 min is still hidden) |
| Carpark detail: black and white, "I've parked here" didn't look tappable, text hard to read, "No live data" next to "Live · updated just now" | Plain grey secondary button; rates printed as raw rule lines ("$0.65 per lot for the day (7am–10:30pm)") and repeated in an "estimate from now" sentence; the motorcycle profile showed "No live data" because that HDB carpark reports only car lots live | Redesign: coloured live-lots card (big number, level pill, fill bar, other vehicle), and when there's no number it says exactly why (lot type not counted here, not in the live feed, out of date, can't reach server); highlight chips (covered, free Sun & PH, height limit, peak / Central Area rates, EV); tonal outlined secondary buttons app-wide; price card with a big estimate, "Now" pill and stay chips; rates as a plain-words table (when / hours / price, free in green, "Most you'll pay" caps, tags such as "First 15 min free"); facts with coloured icons ("Visitor parking: 24 hours", "Payment: Electronic") |
| Lot counts still not shown ("not counted") | Not a network problem: the feed was live. The vehicle in Settings is **Motorcycle**, and only 209 of 1,997 HDB carparks report motorcycle lots live (all report car lots) | No code change; switch Settings → vehicle to Car. The list says "not counted" and the detail explains it |
| Roads: show cameras on the entire screen; road interruptions only within 4 km; does it need the map? | Roads was a sheet over a map with a Feed / Map switch; incidents were island-wide; the camera viewer cropped the image in landscape | Roads is now a full-screen page (map hidden): cameras edge to edge first, then road alerts within 4 km ("All clear" when none), then travel times. The map was dropped: with 8 fixed checkpoint cameras and a 4 km list sorted by distance it added nothing a "Show on Google Maps" button doesn't. The viewer shows the whole image and fills the screen when the phone is turned sideways |
| Weather panel: the "No rain near you" header stayed fixed, leaving a sliver to scroll | The sheet pinned its header, and the half height (≤ 330 px) cut off the 4-day strip | The weather header now scrolls with the content (one-line gauge text), the half height fits the whole panel (≤ 420 px / 56 %), and scrolling a peeking sheet opens it to half (all tabs) |
| Day mode looked black and white, not like concept A | Map zoomed in too far (grey building outlines), landmark icons cluttering it, and a bug that drew no carpark pins until the second availability refresh (the blank start-up style swallowed the first data) | Concept A framing (zoom ≈ 15.5–15.8), landmark icons only from zoom 16.6, soft fade behind the top bar, pins drawn as soon as the map is ready, "N chargers" facts for every driver (EV data refreshed every 15 min for non-EV drivers) |

### Deviations from the plan (decided during implementation)

| Plan | Built | Why |
|---|---|---|
| Worker normalises EV data (§11.4) | Worker passes the 3.3 MB EVCBatch file through; the phone normalises it | Parsing it would exceed the free plan's 10 ms CPU per request |
| Clustering at low zoom (§8.2) | Coloured dots for every carpark + pins from zoom 13 with collision (nearest wins) | Simpler, readable at all zooms; clustering can be added later |
| "Rate / free" chips on the map | Pins show est. cost only with sort = Cheapest | As planned; lots otherwise |
| Weather direct from data.gov.sg | Direct first, any missing part filled from the Worker | Keyless data.gov.sg calls are limited to 6 per 10 s per IP |
| HDB totals from the minute feed | Totals come from the daily catalogue (data.gov.sg), live free lots from DataMall | One availability source; totals rarely change |

### Keys this app needs (register separate ones before release)

| Key | Status in development | For |
|---|---|---|
| LTA DataMall AccountKey | Reusing SG BusXing's | Carpark lots, EV, cameras, incidents, travel times, faulty lights, PUB floods |
| data.gov.sg API key (production tier) | Reusing SG BusXing's | HDB carpark info + totals, NEA weather, rain radar |
| OneMap account (email + password) | Not set (public search works for now) | Place / postal code search |
| URA Data Service AccessKey | Not set → URA standard rates | Exact URA carpark rates and capacity |
| Cloudflare account (Workers free plan) | Not deployed | `cd worker && npm run setup` |
| AdMob app + banner and native/inline unit IDs | Mock slots only | Bottom banner + one in-feed ad (Roads) |

### Pending

| # | Item | Owner |
|---|---|---|
| 1 | ~~Final app name → app ID, wordmark, GitHub repo~~ Done: "SG Car Buddy: Park, EV & Cams", `com.sgcarbuddy.app`, MJLittleByte/sgcarbuddy | — |
| 2 | Register this app's keys (above) into `worker/.env.production`; deploy the Worker (`cd worker && npm run deploy:prod`) | Owner (dev on call) |
| 3 | Real AdMob banner + in-feed unit and UMP consent | Dev |
| 4 | Real-device QA (location, notifications, exact alarms on Android 14–16, low-end performance, TalkBack, 200% text) | Owner + dev |
| 5 | Verify on Cloudflare: Cache API on workers.dev, catalogue build CPU, quota per user | Dev |
| 6 | Privacy policy site (`site/`, GitHub Pages) + Play listing + Data safety drafted in `docs/play-store/listing.md`; take the store screenshots in daylight (`npm run store:screens`); owner submits | Owner |
| 6a | Upload key (`npm run android:keystore`), then `npm run android:aab` against the deployed Worker | Owner |
| 7 | v1.1 backlog (§17): availability trend, Live Updates parked notification, widget, shortcuts, lightning, parked photo, ERP gantries, speed overlay, map clustering | — |

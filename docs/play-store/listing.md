# Google Play store listing: SG Car Buddy (en-SG / en-GB default)

| Asset | File | Spec |
|---|---|---|
| App icon | `icon-512.png` | 512×512 PNG, full-bleed square (Play applies the rounded mask). `cd mobile && npm run brand` |
| Feature graphic | `feature-graphic-1024x500.png` | 1024×500 PNG. `cd mobile && npm run store:graphic` |
| Phone screenshots (upload in this order) | `screenshot-01-parking.png` … `screenshot-06-night.png` | 1080×1920 PNG, 9:16. `cd mobile && npm run store:screens` (take them in daylight; see the script header) |

## App name (max 30)

```
SG Car Buddy: Park, EV & Cams
```

The launcher label on the phone stays **SG Car Buddy** (`android/app/src/main/res/values/strings.xml`).

## Short description (max 80)

```
Everything a Singapore driver needs: parking, EV, checkpoint cams and rain.
```

## Full description (max 4000)

```
Everything a Singapore driver needs, one tap away: parking, EV charging, checkpoint cameras and rain, on one map. No account, no sign-in.

PARKING THAT'S FREE RIGHT NOW
• Live free lots at HDB, URA and mall carparks near you, or near where you're going
• Big, colour-coded counts: plenty, limited, few or full
• Estimated cost for your stay, from published HDB and URA rates, including free Sunday parking, night caps and Central Area rates
• Height limits, covered or open-air, gantry or coupons, visitor hours
• Sort by nearest, most space or cheapest; filter by covered, height and more

EV CHARGING
• Chargers near you with live connector status: free, in use or out of service
• Your plugs only: Type 2, CCS2 or CHAdeMO, with power (kW) and price per kWh
• Chargers at or near each carpark

CHECKPOINT CAMERAS AND ROAD ALERTS
• All live LTA cameras at Woodlands, Tuas and Sentosa, edge to edge
• Full-screen viewer: swipe between cameras, pinch to zoom, turn your phone sideways
• LTA travel time to each checkpoint
• Accidents, breakdowns, roadworks and faulty traffic lights within 4 km
• Expressway travel times and PUB flood alerts

RAIN
• Rain radar for the last hour, island-wide
• Is it raining near you right now, from the nearest NEA rain gauge
• The next 2 hours and the 4-day outlook

REMEMBER WHERE YOU PARKED
• Save your carpark, deck and lot in one tap
• Reminders before free parking ends, the rate goes up or the night cap starts
• Walk back to your car with Google Maps

MADE FOR DRIVING
• Navigate with Google Maps or Waze in one tap
• Day and Night looks, switching automatically
• Car, electric car or motorcycle: lots and prices for your vehicle

PRIVATE BY DESIGN
• No account and no sign-in
• Your location is used on your phone only, never sent to our server
• Saved places, your parked car and settings stay on your phone

Data: carpark availability, EV charging points, traffic cameras, incidents and travel times from LTA DataMall; HDB carpark information, weather, rain radar and flood alerts from HDB, NEA and PUB via data.gov.sg; URA carpark information; place search by OneMap (Singapore Land Authority); maps © OpenStreetMap contributors, OpenFreeMap.

SG Car Buddy is an independent app. It is not affiliated with or endorsed by LTA, HDB, URA, NEA, PUB, SLA, any charging operator or any government agency. Lots, prices and travel times are for information only: always check the signs at the carpark.
```

## Store settings

| Play Console field | Value |
|---|---|
| App or game | App |
| Free or paid | Free |
| Category | Maps & Navigation |
| Tags (pick up to 5) | Parking, Navigation, Traffic, Weather, Electric vehicles (whichever Play offers) |
| Contact email | krishve1589@gmail.com (same as `site/site.config.json`) |
| Website | https://mjlittlebyte.github.io/sgcarbuddy/ |
| Privacy policy URL | https://mjlittlebyte.github.io/sgcarbuddy/privacy/ |
| Countries | Singapore (Malaysia optional: checkpoint drivers) |
| Contains ads | **No** (this version). Change to Yes, with the policy §6 and Data safety, when AdMob ships |
| App access | All functionality is available without special access (no login) |
| Target audience | 18 and over (a driving app; keeps it out of the Families programme) |
| Content rating (IARC questionnaire) | Reference / utility app; no violence, sexual content, gambling, user-generated content or user interaction; shares location: **No** (location never leaves the phone) → expected **Everyone / PEGI 3** |
| News app | No |
| Government app | No (independent; data from public open-data APIs, disclaimer in the description and in the app's About) |
| Health / financial features | None |

## Data safety form

Based on what the app actually does (see `site/privacy/index.html`):

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes**, one: *App activity → In-app search history* (the place-search text is sent to our API and cached by text for up to 7 days, not linked to a user) |
| Location | **Not collected**: coordinates are processed on the phone and never transmitted |
| In-app search history | Collected: yes · Shared: no · Processed ephemerally: no · Required: no (only when you search) · Purpose: App functionality · Not linked to identity |
| Is all user data encrypted in transit? | Yes (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | Yes: email (PDPA request, §8 of the policy); nothing is tied to a user, all on-device data is deleted by clearing storage |
| Independent security review | No |

## Permissions to justify (if Play asks)

| Permission | Why |
|---|---|
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Carparks, chargers, road alerts and rain near you. Foreground only, asked on first use; approximate location works |
| `POST_NOTIFICATIONS` | Parking reminders the user turns on (free parking ending, rate rising, night cap) |
| `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | From the local-notifications plugin, so reminders fire on time and survive a restart. No `USE_EXACT_ALARM`, so no declaration form |

## Release notes (v0.1.0, first release)

```
First release: live parking lots and cost, EV chargers, checkpoint cameras, road alerts within 4 km, rain radar, and reminders for where you parked.
```

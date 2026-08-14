# Kinetica for iOS — Iron & Chalk

A native SwiftUI client for the self-hosted Kinetica server, built to compile on
**Xcode 13.2.1** (the last version that runs on a 2013 MacBook Air / macOS Big Sur).

It is a *client*, not a second app: it talks to the same Next.js API over
Tailscale, so the phone and the browser share one database, one AI coach, one
history. No business logic is duplicated here — totals, food dedupe, BMR-backed
targets and the whole nutrition pipeline stay on the server.

## What's in this build

| Included | Not included |
|---|---|
| Dashboard — Chalk Ring, macros, water, streak/XP | **Workouts (all of it)** — by request |
| Food — day view, meal list, edit and delete a meal | Sleep logging |
| Logging — saved-food search, AI describe, blank entry | Progress / goal photos |
| Journal — entries, mood, wins, coach replies | Body measurements |
| Profile — body data, targets, server address, sign out | Push notifications, widgets |
| | Onboarding (do it once in the browser) |
| | Photo meal capture (AI *text* describe works) |

Everything absent is a deliberate cut for a first installable pass, not a
blocker — the API endpoints all exist already.

## Requirements

- Xcode 13.2.1 (iOS 15.2 SDK, Swift 5.5)
- Deployment target: **iOS 15.0**
- iPhone only, portrait only
- Tailscale on the phone, and the PC awake running `npm run start`

## Build

1. Open `ios/Kinetica.xcodeproj`.
2. Leave **Team** set to *None* under *Signing & Capabilities*.
3. Pick a **simulator** in the destination dropdown (iPhone 13, say) — not
   *Any iOS Device*.
4. Build and run.

**Don't set a Team, and don't select a device destination, until you actually
want the app on the phone.** The moment you do either, Xcode tries to mint a
development provisioning profile, and on a free Apple ID with no iPhone it can
talk to that fails with:

> Failed to create provisioning profile. There are no devices registered in
> your account on the developer website.

That error says nothing about your code. Simulator builds aren't signed at all,
so `Team: None` + a simulator destination compiles and runs the whole app with
the signing machinery switched off entirely.

The useful part: **you never need Xcode signing to work.** The sideloading route
below has Sideloadly re-sign the app with your Apple ID and register the device
itself, so Xcode's provisioning system stays out of it from start to finish.

The app runs against `https://damonj-pc.tailcc1d47.ts.net:9879` by default. That's
editable inside the app (on the login screen under *Server*, and later in the
**You** tab), so pointing it at `next dev` on the LAN never needs a rebuild —
which matters, because re-signing a sideloaded app is a chore.

## Getting it onto a modern iPhone

**This is the awkward part.** Xcode 13.2.1 ships device-support files only up to
iOS 15.2. Installing directly from Xcode to a phone running anything newer will
fail with *"could not locate device support files"*.

Two routes. Read both before starting — the second is the one I'd bet on.

### Route A — Xcode DeviceSupport transplant (iOS 16 only, fragile)

Drop a matching `DeviceSupport` folder into

```
/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/DeviceSupport/
```

then restart Xcode. This is known to work for iOS 16.x. It does **not** work for
iOS 17 and later: iOS 17 moved device communication to a new tunnelled protocol
that Xcode 13 doesn't speak at all, so no amount of copied files will help.

### Route B — build an `.ipa` and sideload it (works regardless of iOS version)

The binary itself is fine on any modern iOS — apps built against old SDKs keep
running, they just don't opt into newer system behaviours. It's only *Xcode's
installer* that's too old. So bypass it.

From the `ios` directory:

```bash
./tools/build-ipa.sh
```

That writes `ios/Kinetica.ipa`. Drop it on **Sideloadly** (or
**AltStore/SideStore**), enter your Apple ID, and let it sign and install. Both
bundle their own current device-communication libraries and run happily on Big
Sur. If the build fails the script prints the deduplicated compile errors rather
than making you dig through the log.

Two things the script is working around, in case it ever needs changing:

- It builds **unsigned** (`CODE_SIGNING_ALLOWED=NO`) because a free Apple ID
  can only be issued a profile for a device Xcode has registered, and Xcode
  13.2.1 can't talk to an iOS 16+ phone in order to register it. Sideloadly
  signs the app and registers the device itself, so Xcode's provisioning system
  is never involved.
- It avoids *Product → Archive*, which fails on exactly that wall — archiving
  insists on a valid provisioning profile. An `.ipa` is only a zip with the app
  inside a folder named `Payload`, so the script assembles one directly.

### Free Apple ID caveats

- The app **expires after 7 days** and must be reinstalled. AltStore/SideStore
  can auto-refresh it over wifi; plain Sideloadly can't.
- Three sideloaded apps at a time, ten new app IDs per week.
- No push notifications, no App Groups — which is why the home-screen widget
  from the design spec isn't in this build. It needs a paid account to be worth
  writing.

## First run

1. Connect the phone to Tailscale and confirm the server is reachable in Safari.
2. Launch Kinetica, check the address under *Server*, sign in with the same
   email and password you use in the browser.
3. If the account has never been through onboarding, the app will say so and
   send you to the browser. Onboarding is a one-time five-step wizard and isn't
   worth reimplementing on a phone screen.

Auth is Better Auth's ordinary session cookie — exactly what the PWA uses.
`URLSession` handles it, and the cookie is snapshotted to `UserDefaults` so a
cold launch doesn't dump you back at the login screen. There is no token or
password stored anywhere in the app.

## Fonts

Fraunces (SIL Open Font License) is bundled in `Kinetica/Resources/Fonts` and
registered via `UIAppFonts`. It carries the display type role — big numbers,
headers, the nav bar's large title. If the files are ever removed the app falls
back to the system serif rather than to San Francisco, which would flatten the
identity entirely.

Two static instances are bundled (Medium, SemiBold) rather than the variable
font, because iOS 15's variable-font support is unreliable. The tradeoff: no
access to Fraunces' `SOFT`/`WONK` axes, so the "softer at large sizes" note in
the design spec isn't literally implemented — the optical size is fixed.

## Working on the project

Xcode 13 can't add files to a target from the command line, and hand-editing a
`pbxproj` is a good way to lose an afternoon. So the project is generated:

```bash
python3 ios/tools/generate_project.py
```

It walks `ios/Kinetica`, mirrors the folders as Xcode groups, and sorts files
into the right build phase. Object ids are derived from file paths, so re-running
without changes produces an identical file. **Run it after adding or deleting a
Swift file**, then reopen the project.

The app icon is likewise generated from the palette rather than checked in as an
opaque binary:

```bash
python3 ios/tools/make_icon.py
```

### Layout

```
Kinetica/
  Design/     Palette, Typography, ChalkRing, Components, Haptics
  Core/       APIClient, Models, AppConfig, AppState, DayStore
  Features/   One file per screen
  Resources/  Fonts, Assets.xcassets
```

`Design/` is the whole design language and nothing else — no screen should
contain a raw hex value or a font size that isn't a token.

## iOS 15 constraints worth knowing before you edit

The SDK ceiling bites in specific, recurring places:

- `NavigationView`, not `NavigationStack`. `NavigationLink(destination:label:)`
  takes a **value**, not a ViewBuilder closure.
- `ScrollView` has no pull-to-refresh; `.refreshable` only works on `List`.
  That's why the dashboard has an explicit refresh button.
- Only one `.sheet(isPresented:)` per view reliably presents. Where a screen
  needs two, use `.sheet(item:)` with an enum (see `DashboardView`).
- No `TextField(axis: .vertical)` — multi-line input is a `TextEditor` with a
  hand-rolled placeholder behind it.
- No Swift Charts, no `PhotosPicker`, no `.presentationDetents`, no
  `.scrollContentBackground`.
- Swift 5.5: no `if let x {` shorthand, no `any` existentials.
- Every `View` struct is explicitly `@MainActor` because `AppState`/`DayStore`
  are — Swift 5.5 errors on touching main-actor state from a view's
  non-isolated computed properties, and the annotation is the cheap fix.

## Known gaps

- **Not compile-tested.** It was written on Linux, where there's no Swift/iOS
  toolchain to check it against. Expect to fix a handful of compile errors on the
  first build; the shapes and API contracts are the parts that were verified
  carefully.
- The Chalk Ring's grain is a cached 96×96 noise tile masked to the arc. It
  reads correctly at the sizes used here; at very large sizes the tiling may
  become visible.
- Meal logging sends `source: "ai"` only when the coach was actually used, so
  hand-entered rows don't accumulate in My Foods. There's no My Foods management
  screen in this build — use the web app for merges and renames.

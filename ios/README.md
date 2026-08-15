# Kinetica for iOS — Iron & Chalk

A native SwiftUI client for the self-hosted Kinetica server, built with
[xtool](https://github.com/xtool-org/xtool) on Linux against the **iOS 26.4 SDK**.

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

Everything absent is a deliberate cut, not a blocker — the API endpoints all
exist already.

## Build

```bash
cd ios
xtool dev build
```

Output: `ios/xtool/Kinetica.app`. To build, sign and install to a connected
device in one go:

```bash
xtool dev run
```

Requires, once, on the build machine:

- **Swift 6.3+** toolchain
- **xtool**, with `xtool setup` completed (Apple ID credentials + Darwin SDK)
- **usbmuxd** running, for install over USB
- A Darwin Swift SDK registered as `darwin` (`swift sdk list` to check)

`xtool dev generate-xcode-project` produces an Xcode project on demand if one is
ever wanted — there's no checked-in `.xcodeproj`, and nothing depends on Xcode.

## Layout

```
ios/
  Package.swift          SwiftPM manifest — target points at Kinetica/ via `path:`
  xtool.yml              bundle id, Info.plist, icon, bundled resources
  Support/Info.plist     app Info.plist (kept out of xtool/, the output dir)
  Kinetica/
    Design/              Palette, Typography, ChalkRing, Components, Haptics
    Core/                APIClient, Models, AppConfig, AppState, DayStore
    Features/            One file per screen
    Resources/           Fonts, AppIcon.png
  tools/make_icon.py     regenerates AppIcon.png from the palette
```

`Design/` is the whole design language and nothing else — no screen should
contain a raw hex value or a font size that isn't a token.

Two details worth knowing before changing the build config:

- **Fonts go through `xtool.yml`'s `resources`, not SwiftPM's.** A library
  target's SwiftPM resources land in a nested `.bundle`, which is the wrong
  place for fonts registered via `UIAppFonts`. `xtool.yml` copies them to the
  bundle root, where the plist expects them.
- **`iconPath` is a single 1024px PNG.** xtool copies it to the bundle root and
  sets `CFBundleIconFile`; there's no asset catalog, so macOS-only `actool`
  never enters into it. `tools/make_icon.py` draws it from the same colour
  tokens as the app.

## Installing

`xtool dev run` builds, signs and installs over USB. Alternatively `xtool
install <ipa>`, or hand the `.app` to Sideloadly/AltStore.

Three toolchain gotchas, learned the hard way and written up properly in
`~/dev/apps/ScreenSprouts/ios/SETUP.md` — that's the canonical doc for this
machine's Swift/xtool setup:

- **Check the device with `idevice_id -l`, not `xtool devices`.** The latter
  blocks indefinitely when nothing is plugged in rather than reporting an empty
  list, so it looks like a hang when it just means "no device".
- **`usbmuxd` has to be running** (`pgrep -a usbmuxd`). The daemon is a separate
  package from `libimobiledevice`, so having the tools doesn't mean having it.
- **Any `xtool sdk install` replaces the whole SDK bundle**, silently dropping
  the clang-header patch that lives on top of it. Re-run
  `ScreenSprouts/ios/tools/verify-sdk.sh` afterwards. It doesn't bite this app —
  Kinetica never reaches the affected headers — but a clean build here is not
  evidence the SDK is whole.

Free Apple ID caveats, unchanged by any of this:

- The app **expires after 7 days** and must be reinstalled. AltStore/SideStore
  can auto-refresh over wifi.
- Three sideloaded apps at a time, ten new app IDs per week.
- No push notifications, no App Groups — which is why the home-screen widget
  from the design spec isn't here. It needs a paid account to be worth writing.
- iOS 16+ requires **Developer Mode**: Settings → Privacy & Security →
  Developer Mode → on → restart. One time only.

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
font. The tradeoff: no access to Fraunces' `SOFT`/`WONK` axes, so the "softer at
large sizes" note in the design spec isn't literally implemented — the optical
size is fixed.

## History

This started life as an Xcode 13.2.1 project targeting iOS 15, because the only
Mac available was a 2013 MacBook Air stuck on Big Sur. That ceiling shaped a lot
of code: `NavigationView` instead of `NavigationStack`, a manual refresh button
because `ScrollView` had no `refreshable`, a `TextEditor` with a fake
placeholder standing in for a multi-line `TextField`, and the design spec's
letter-spacing dropped because `tracking` didn't exist yet.

xtool removed the ceiling, and all of that is now gone. The old project is in
git history if it's ever needed; `xtool dev generate-xcode-project` is the
better answer.

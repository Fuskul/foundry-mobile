# Foundry Mobile

An Android companion app for [Foundry VTT](https://foundryvtt.com), built first for
**Warhammer Fantasy Roleplay 4e** and designed so other systems can be added as adapters.

The project has two halves:

| Part | What it is |
| --- | --- |
| `module/` | `fvtt-mobile-bridge` — a Foundry module that prepares sheet data and executes **real system rolls** on behalf of phones |
| `app/` | The mobile client — React + TypeScript, packaged for Android with Capacitor |

The same web build is used twice: Foundry serves it at
`/modules/fvtt-mobile-bridge/app/` (so a phone can use it with no install at all),
and Capacitor wraps it into an APK.

## Why a module is needed

A phone can log into Foundry and read raw documents over socket.io, but raw documents are
not a character sheet: WFRP4e computes skill totals, armour points, wound maxima and the
whole test pipeline (SL, criticals, fumbles, hit locations, Advantage, talents and effects)
in system code that only runs inside a Foundry client.

So the app never re-implements the rules. It asks the bridge module — running in a desktop
browser that is already in the game — to prepare the sheet and to roll. The result is a
normal WFRP4e chat card, identical to one rolled on a laptop.

**Consequence:** at least one browser client with the module enabled must be online.
Normally that is the GM.

## Architecture

```
Android app --login POST /join--> Foundry server
        |
        +-- socket.io (session id in query) --> world data, live document updates
        |
        +-- socket event "module.fvtt-mobile-bridge"
                     |
                     v
            GM's browser (bridge module)
                     |  actor.setupSkill(...) -> test.roll()
                     v
            normal WFRP4e chat card
```

Requests are broadcast; exactly one client answers, chosen by a deterministic election
(lowest-id active GM, else lowest-id active owner of the actor). If nobody answers within
the timeout the app retries in broadcast mode.

## Install the module

1. Download `fvtt-mobile-bridge.zip` from the Releases page.
2. Unzip into your Foundry `Data/modules/` folder so you get `Data/modules/fvtt-mobile-bridge/`.
3. Restart Foundry, then enable **Mobile Bridge** in your world's module settings.
4. Open the scene-controls button (phone icon) or Settings -> Mobile app to see the QR code.

## Use it without installing an app

Open the address from the QR code on your phone. It is the same interface, running in the
mobile browser. Handy for testing and for iOS users.

## Build the APK

You do not need Android Studio. Push this repository to GitHub and the
`Build Android APK` workflow produces `foundry-mobile-debug.apk` as a build artifact;
pushing a `v*` tag also publishes a release with the APK and the module zip.

Locally (if you do have the Android SDK):

```bash
cd app
npm ci
npm run build:web
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Adding another system

Write an adapter in `module/scripts/systems/` exposing `matches()`, `config()`,
`sheet(actor)`, `roll(actor, payload)` and optionally `setResource(...)`, then register it
in `systems/index.js`. The app renders whatever the adapter returns; `generic.js` is the
fallback for systems with no adapter yet.

## Security note

Foundry relays module socket events without an authenticated sender, so the bridge trusts
the `from` field in a request. Everyone who can send that event is already an authenticated
user of your world, but a malicious *player* could name another user's id. Ownership is
still enforced against that claimed user, and the GM can turn the bridge or rolls off in
module settings. Do not enable this on a world with untrusted players until request signing
lands (see the roadmap).

## Licence

MIT for this project. Bundled `scripts/vendor/qrcode.js` is Kazuhiko Arase's QR Code
Generator, MIT.

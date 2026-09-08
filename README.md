# Foundry Mobile

An Android companion app for [Foundry VTT](https://foundryvtt.com), built first for
**Warhammer Fantasy Roleplay 4e** and designed so other systems can be added as adapters.
Interface in Russian and English.

The project has two halves:

| Part | What it is |
| --- | --- |
| `module/` | `fvtt-mobile-bridge` — a Foundry module that prepares sheet data and executes **real system rolls** on behalf of phones |
| `app/` | The mobile client — React + TypeScript, packaged for Android with Capacitor |

Requires **Foundry VTT 14.367 or newer**. Tested against **wfrp4e 9.6.4**.

## What the app can do

- **Character sheet, in full.** Nine tabs — main, skills, talents, combat, effects, magic,
  religion, trappings, notes — carrying everything the desktop sheet shows: characteristics,
  wounds, Advantage, Fate/Fortune, Resilience/Resolve, corruption, armour points per hit
  location, encumbrance, careers, criticals and ailments, containers and money, ambitions
  and the experience log.
- **Editing.** Anything a player can change on a laptop can be changed from the phone:
  characteristic values, skill advances, equipped and worn items, quantities, memorised
  spells, channelled SL, ingredients, ammunition, conditions, experience, notes.
- **Advancement.** The same `+` / `✓` controls the desktop sheet shows, with the cost and a
  confirmation before experience is spent. The module does the arithmetic itself, so the
  system's own dialog never opens on someone else's screen.
- **Rolls.** Characteristics, skills, weapons, traits, casting, channelling, prayers and
  extended tests go through the system's own API, so the chat card is the normal WFRP4e one
  — indistinguishable from a roll made at the table.
- **Chat.** Live chat with the system's card styling, images that open full size, dice
  presets (d4–d100) with visibility modes, and card buttons pressed from the phone.
- **Opposed tests.** The defence options a card offers are shown by name, and the defender's
  roll is made on the phone's behalf rather than as a dialog on the host's screen.
- **Combat.** A live turn tracker with round, initiative order, a "your turn" cue, rolling
  your own initiative, GM turn controls, and picking a target so a phone-initiated attack
  opens the opposed test against it.
- **Effects.** Active effects can be switched on and off from the phone, with descriptions.
- **Works when the host blinks.** The last sheet is cached and shown read-only when no
  browser is hosting, and the app reconnects and refills on wake.
- **Module content.** Items that modules add — cants (Archives III), runes (Dwarfs),
  techniques (High Elves), chanties (Sea of Claws), anything from a third-party compendium —
  appear in the tab and under the name their own module chose, read through WFRP4e's
  placement API rather than hard-coded here.
- **Servers.** A saved list with your own name per address, an online check, world, system
  and player count; dark/light theme and language switchable before and after connecting.
- **Phone and tablet.** Swipe between tabs; on a tablet the layout widens into columns
  instead of stretching the phone design sideways.

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

Because requests execute in that browser, anything the system announces while serving a
phone ("no active encounter, Advantage unchanged") is captured and sent back to the phone
that asked, instead of appearing on the host's screen.

## Architecture

```
Android app --POST /join (userId + password)--> Foundry server
        |                                          session cookie
        +-- socket.io (cookie on the handshake) --> world data, live document updates
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

The app's transport is polling-first so that the session cookie reaches the WebSocket
handshake — Foundry 14 authenticates the socket by cookie alone.

## Install the module

1. Download `fvtt-mobile-bridge.zip` from the Releases page.
2. Unzip into your Foundry `Data/modules/` folder so you get `Data/modules/fvtt-mobile-bridge/`.
3. Restart Foundry, then enable **Mobile Bridge** in your world's module settings.
4. Open the scene-controls button (phone icon) or Settings → Mobile app to see the QR code.

GM settings: the bridge can be switched off entirely, and editing and rolling can be
disabled separately.

## Use it without installing an app

Open the address from the QR code on your phone. It is the same interface, running in the
mobile browser. Handy for testing and for iOS users.

## Build the APK

You do not need Android Studio. Push this repository to GitHub and the
`Build Android APK` workflow produces `foundry-mobile-debug.apk` as a build artifact;
pushing a `v*` tag also publishes a release with the APK and the module zip. The APK is
signed with a committed keystore, so each build installs over the previous one.

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
`sheet(actor)`, `roll(actor, payload)` and optionally `edit(...)`, `advance(...)`,
`condition(...)`, `useItem(...)` and `opposed(...)`, then register it in `systems/index.js`.
The app renders whatever the adapter returns; `generic.js` is the fallback for systems with
no adapter yet.

## Security

Foundry relays module socket events without an authenticated sender, so the bridge trusts
the `from` field in a request. True cryptographic signing is impossible from a client-only
module (Foundry gives modules no server-side hook), so the bridge instead enforces a set of
GM-controlled limits (module settings):

- **Ownership** — a request may only touch actors the claimed user owns (or their assigned
  character); observers get read-only data at most.
- **Assigned character only** — optionally restrict a player's phone to their assigned
  character, ignoring any other actors they happen to own.
- **Allowlist** — optionally name exactly which users may drive phones; everyone else is
  refused.
- **Rate limit** — cap how many changing actions a phone may make in ten seconds.
- **Audit** — optionally whisper the GMs a line whenever a phone changes something, so remote
  play is visible.
- The bridge, rolls, and edits can each be switched off entirely.

The residual risk is a malicious *player* naming another user's id to act as them; the
allowlist and assigned-character lock reduce it, and the audit trail surfaces it. Treat the
app like any other trust you extend to the people already in your world.

## Roadmap

Planned work, in order, is in [ROADMAP.md](ROADMAP.md).

## Licence

MIT for this project. Bundled `scripts/vendor/qrcode.js` is Kazuhiko Arase's QR Code
Generator, MIT.

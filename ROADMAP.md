# Roadmap

Where the project is now and what is worth building next, in the order I would build it.
Each entry says why it matters and what "done" looks like, so a release can be cut at any
point without half-finished work hanging around.

## Where we are (0.3)

Version 0.3 adds a combat tracker with initiative, your-turn and targeting; toggleable
effects and bulk advancement; a cached read-only sheet when no host is online; and a set of
GM security controls (allowlist, assigned-character lock, rate limit, audit). It builds on
0.2.x: the full sheet, editing, advancement, rolls through the system's own API, chat with
card buttons and images, opposed tests answered from the phone, module-added item types,
saved servers, RU/EN, dark/light, phone and tablet layouts.

Still open from each epic: request-signing is not possible client-only (see Security below),
full offline edit-queueing, vehicles/parties as actor types, and adding items from
compendia — these remain future work.

The pieces that are known to be missing or weak are listed below.

---

## 1. Trust and safety of the bridge

**Why first.** The module is published; anyone can install it into a world with players who
are not friends. Today a request carries a `from` field that the bridge believes, so a
player could name another user's id and act as them. Everything else on this list is worth
less than closing that.

- Sign each request: the app asks the server for a short-lived token tied to its session,
  the bridge verifies it before acting.
- Failing that (Foundry gives modules no server-side hook), fall back to a per-user secret
  that the GM's client hands out over a whispered message on connect.
- Rate-limit requests per user, and log refusals where the GM can see them.
- A GM setting for "phones may act only for the character assigned to that user".

**Done when** a player cannot make the bridge act as another user, and the README's security
note can be deleted rather than qualified.

## 2. Reliability when the host browser is not there

**Why.** The whole design depends on one browser being online. Right now, if it is not, the
app simply times out and the player does not know why.

- A clear state in the app: "nobody is hosting the bridge right now", with what to do.
- Queue edits made while offline and replay them when a host reappears (rolls must not be
  queued — a roll made ten minutes late is wrong).
- Fall back to a read-only sheet from the last successful `sheet` response, so a player can
  still look at their character.
- Automatic re-election when the hosting client closes mid-session.

**Done when** closing the GM's laptop mid-game degrades the app instead of breaking it.

## 3. Combat

**Why.** It is the part of a session where a phone is most useful and where the app is
currently thinnest.

- Initiative tracker: turn order, whose turn it is, a "your turn" cue.
- Advantage in and out of combat, with the system's own rules applied.
- Targeting from the phone (pick a target token, then attack it) — needed for opposed tests
  started by the player rather than answered by them.
- Damage application from a card the player owns.
- Reactions and Defensive options where the system exposes them.

**Done when** a player can fight a whole combat from the phone without touching a laptop.

## 4. iOS and the browser build

**Why.** The same web build already runs in a mobile browser; iOS players are one build
target away, and a PWA covers everyone with no store at all.

- Installable PWA: manifest, icons, service worker, offline shell.
- Capacitor iOS target and a TestFlight build.
- Check the cookie/socket path on iOS Safari, which is stricter than Android's WebView.

**Done when** an iPhone player can add the app to their home screen and log in.

## 5. Sheet depth for WFRP4e

**Why.** Parity with the desktop sheet is the promise of the app; these are the corners still
missing.

- Vehicles, parties and enterprises (Archives III) as actor types.
- Trade and income (Sea of Claws, Archives III) where the module drives them.
- The compendium browser: adding items to a character from the phone.
- Effects the player may enable and disable, with their descriptions.
- Bulk advancement (buy several advances at once) and the career-completion flow.

**Done when** a player has no reason to say "I'll do that on the computer later".

## 6. A second system

**Why.** The adapter layer exists but has only ever been driven by one system, so it is
guaranteed to be shaped wrong in places until a second one uses it.

- Pick a system with a different test model — Imperium Maledictum (also Cubicle 7, close
  data shapes) is the cheap first step; D&D 5e is the widest audience.
- Split anything WFRP-specific out of the app's sheet rendering into adapter-driven layout
  descriptions, so a new system needs no app release.

**Done when** a second system's players can use the app with no app change, only a module
release.

## 7. Notifications and presence

- Push (or local) notification when it is your turn, when a whisper arrives, or when a test
  is requested of you.
- Show which players are online, as Foundry does.
- A "raise hand" or ping the GM can see.

## 8. Polish that keeps paying off

- Screen-reader labels and larger-text support; the sheet is dense and needs it.
- A settings screen for the GM inside the app (what phones may do), not only in Foundry.
- Proper release notes per version, and a changelog file.
- Automated checks: a smoke test that logs into a scratch world, opens a sheet and rolls,
  run in CI so a broken build never reaches a phone.
- Translations beyond RU/EN, taken from the world's own i18n wherever possible (the sheet
  already does this; the app's own strings do not).

---

## Working agreements

- **Game terms always come from the world.** Anything a player reads on the sheet should be
  the term their Foundry translation uses, not a string invented here.
- **Never re-implement rules.** If the system or a module can do it, call it; the app is a
  view and a remote control.
- **Nothing happens on the host's screen.** A phone's action must not open dialogs or raise
  notifications on someone else's client.
- **A version per change.** `module.json` and the APK version move together, so a bug report
  can name a version.

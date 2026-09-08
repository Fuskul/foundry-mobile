import { MODULE_ID, SOCKET, PROTOCOL_VERSION, EXECUTOR_MODE } from "./constants.js";
import { debug, info, warn, error, setVerbose } from "./log.js";
import { shouldHandle, requesterOf } from "./executor.js";
import { HANDLERS } from "./api.js";
import { renderConnectDialog } from "./ui.js";

/* ------------------------------------------------------------------ settings */

Hooks.once("init", () => {
  const s = (key, data) => game.settings.register(MODULE_ID, key, data);

  s("enabled", {
    name: "FVTTMB.Setting.Enabled", hint: "FVTTMB.Setting.EnabledHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  s("allowRolls", {
    name: "FVTTMB.Setting.AllowRolls", hint: "FVTTMB.Setting.AllowRollsHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  s("allowEdits", {
    name: "FVTTMB.Setting.AllowEdits", hint: "FVTTMB.Setting.AllowEditsHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  s("requireOwnership", {
    name: "FVTTMB.Setting.RequireOwnership", hint: "FVTTMB.Setting.RequireOwnershipHint",
    scope: "world", config: true, type: Boolean, default: true
  });
  s("executorMode", {
    name: "FVTTMB.Setting.ExecutorMode", hint: "FVTTMB.Setting.ExecutorModeHint",
    scope: "client", config: true, type: String, default: EXECUTOR_MODE.AUTO,
    choices: {
      [EXECUTOR_MODE.AUTO]: "FVTTMB.Setting.ExecutorAuto",
      [EXECUTOR_MODE.ALWAYS]: "FVTTMB.Setting.ExecutorAlways",
      [EXECUTOR_MODE.NEVER]: "FVTTMB.Setting.ExecutorNever"
    }
  });
  s("verbose", {
    name: "FVTTMB.Setting.Verbose", hint: "FVTTMB.Setting.VerboseHint",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: setVerbose
  });

  // --- Safety controls for a world with players you don't fully trust ---
  s("allowlist", {
    name: "FVTTMB.Setting.Allowlist", hint: "FVTTMB.Setting.AllowlistHint",
    scope: "world", config: true, type: String, default: ""
  });
  s("assignedOnly", {
    name: "FVTTMB.Setting.AssignedOnly", hint: "FVTTMB.Setting.AssignedOnlyHint",
    scope: "world", config: true, type: Boolean, default: false
  });
  s("rateLimit", {
    name: "FVTTMB.Setting.RateLimit", hint: "FVTTMB.Setting.RateLimitHint",
    scope: "world", config: true, type: Number, default: 0
  });
  s("audit", {
    name: "FVTTMB.Setting.Audit", hint: "FVTTMB.Setting.AuditHint",
    scope: "world", config: true, type: Boolean, default: false
  });

  // The connect-dialog menu is a convenience; if subclassing the core app class
  // ever fails on a new Foundry version it must not take the settings section
  // (and therefore the whole module's controls) down with it.
  try {
    const MenuBase = foundry?.applications?.api?.ApplicationV2 ?? FormApplication;
    class ConnectMenu extends MenuBase {
      render() { renderConnectDialog(); return this; }
    }
    game.settings.registerMenu(MODULE_ID, "connectMenu", {
      name: "FVTTMB.Menu.Connect",
      label: "FVTTMB.Menu.ConnectLabel",
      hint: "FVTTMB.Menu.ConnectHint",
      icon: "fas fa-mobile-screen",
      type: ConnectMenu,
      restricted: false
    });
  } catch (err) {
    console.error("[MobileBridge] connect menu registration failed (settings still registered):", err);
  }
});

/* -------------------------------------------------------------------- ready */

Hooks.once("ready", () => {
  // The socket listener is the whole point of the module, so it goes on first
  // and on its own — nothing after it can stop the bridge from listening.
  try {
    game.socket.on(SOCKET, onSocket);
  } catch (err) {
    console.error("[MobileBridge] could not attach the socket listener:", err);
  }

  try { setVerbose(game.settings.get(MODULE_ID, "verbose")); } catch (_e) { /* setting may be missing */ }
  try { registerChangeBroadcast(); } catch (err) { console.error("[MobileBridge] change broadcast failed:", err); }

  try {
    game.modules.get(MODULE_ID).api = {
      handlers: HANDLERS,
      protocol: PROTOCOL_VERSION,
      openConnectDialog: renderConnectDialog,
      selftest: () => ({
        ready: true,
        protocol: PROTOCOL_VERSION,
        enabled: game.settings.get(MODULE_ID, "enabled"),
        system: game.system.id,
        isGM: game.user.isGM,
        user: game.user.name
      })
    };
  } catch (err) {
    console.error("[MobileBridge] could not publish the module API:", err);
  }

  // A plain, always-on console banner so a GM can confirm in one glance (F12)
  // that the bridge loaded and is listening — the commonest support question.
  const on = (() => { try { return game.settings.get(MODULE_ID, "enabled"); } catch { return "?"; } })();
  console.log(
    `%c[MobileBridge]%c online — protocol v${PROTOCOL_VERSION}, system "${game.system.id}", enabled=${on}, you are ${game.user.isGM ? "GM" : "a player"} (${game.user.name}). Listening for phones.`,
    "color:#c8a24a;font-weight:bold", "color:inherit"
  );
  info(`ready — protocol v${PROTOCOL_VERSION}, system "${game.system.id}"`);
});

/* ------------------------------------------------------------------- socket */

async function onSocket(message) {
  if (!message || message.t !== "req") return;
  if (!game.settings.get(MODULE_ID, "enabled")) return;
  if (!shouldHandle(message)) return;

  const user = requesterOf(message);
  if (!user) return reply(message, false, null, "Unknown user");

  const handler = HANDLERS[message.action];
  if (!handler) return reply(message, false, null, `Unknown action "${message.action}"`);

  // Allowlist: if the GM has named who may use phones, everyone else is refused.
  if (!onAllowlist(user)) {
    return reply(message, false, null, game.i18n.localize("FVTTMB.Reject.NotAllowed"));
  }
  // Rate limit: cap changing actions per user over a short window.
  if (MUTATING.has(message.action) && rateLimited(user.id)) {
    return reply(message, false, null, game.i18n.localize("FVTTMB.Reject.RateLimited"));
  }

  debug("handling", message.action, "for", user.name, message.payload);
  const collected = captureNotifications();
  try {
    const data = await handler({ payload: message.payload ?? {}, user });
    if (MUTATING.has(message.action)) auditAction(user, message.action, message.payload);
    reply(message, true, data ?? null, null, collected.stop());
  } catch (err) {
    error(message.action, err);
    reply(message, false, null, err?.message ?? String(err), collected.stop());
  }
}

/** Actions that change the world (as opposed to reads); these are the guarded ones. */
const MUTATING = new Set([
  "edit", "advance", "condition", "effect", "roll", "opposed", "useItem",
  "cardAction", "resource", "chat", "combatAction"
]);

function onAllowlist(user) {
  let raw = "";
  try { raw = String(game.settings.get(MODULE_ID, "allowlist") ?? "").trim(); } catch { return true; }
  if (!raw) return true;
  const allowed = raw.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(user.id.toLowerCase()) || allowed.includes(user.name.toLowerCase());
}

const rateHits = new Map();
function rateLimited(userId) {
  let limit = 0;
  try { limit = Number(game.settings.get(MODULE_ID, "rateLimit")) || 0; } catch { limit = 0; }
  if (limit <= 0) return false;
  const now = Date.now();
  const hits = (rateHits.get(userId) ?? []).filter(t => now - t < 10000);
  if (hits.length >= limit) { rateHits.set(userId, hits); return true; }
  hits.push(now);
  rateHits.set(userId, hits);
  return false;
}

/** Tell the GMs, quietly, what a phone just changed — an audit trail they can see. */
function auditAction(user, action, payload) {
  let on = false;
  try { on = game.settings.get(MODULE_ID, "audit"); } catch { on = false; }
  if (!on) return;
  const actor = payload?.actorId ? game.actors.get(payload.actorId) : null;
  const line = game.i18n.format("FVTTMB.Audit.Line", {
    user: user.name,
    action,
    on: actor ? ` — ${actor.name}` : ""
  });
  const gmIds = game.users.filter(u => u.isGM && u.active).map(u => u.id);
  if (!gmIds.length) return;
  try {
    ChatMessage.create({
      content: `<span class="fvttmb-audit">📱 ${line}</span>`,
      whisper: gmIds,
      speaker: { alias: "Mobile Bridge" }
    });
  } catch (err) { console.warn("[MobileBridge] audit failed:", err); }
}

/**
 * A request from a phone runs in this browser, so anything the system reports
 * — "no active encounter, Advantage unchanged", for instance — would pop up on
 * the host's screen for something they did not do. Collect those instead and
 * send them back to the phone that asked.
 */
function captureNotifications() {
  const notes = [];
  const target = ui?.notifications;
  if (!target) return { stop: () => notes };

  const original = {};
  for (const level of ["notify", "info", "warn", "error"]) {
    original[level] = target[level];
    target[level] = function (messageText, options = {}) {
      try {
        const text = options?.localize ? game.i18n.localize(messageText) : String(messageText ?? "");
        notes.push({ level: level === "notify" ? (options?.type ?? "info") : level, text });
      } catch { /* never let logging break a request */ }
      if (options?.permanent) return original[level].call(this, messageText, options);
      return null;
    };
  }

  let stopped = false;
  return {
    stop() {
      if (!stopped) {
        stopped = true;
        for (const level of Object.keys(original)) target[level] = original[level];
      }
      return notes;
    }
  };
}

function reply(request, ok, data, err, notes) {
  game.socket.emit(SOCKET, {
    t: "res",
    id: request.id,
    to: request.from,
    ok,
    data,
    error: err,
    notes: notes ?? [],
    executor: { id: game.user.id, name: game.user.name }
  });
}

/* ---------------------------------------------------- change notifications */

function registerChangeBroadcast() {
  const pending = new Set();
  let timer = null;

  const flush = () => {
    timer = null;
    const ids = [...pending];
    pending.clear();
    if (!ids.length) return;
    game.socket.emit(SOCKET, { t: "evt", event: "actorChanged", actorIds: ids });
  };

  const touch = actor => {
    if (!actor?.id) return;
    if (game.settings.get(MODULE_ID, "executorMode") === EXECUTOR_MODE.NEVER) return;
    if (!game.user.isGM && !actor.isOwner) return;
    pending.add(actor.id);
    if (!timer) timer = setTimeout(flush, 400);
  };

  Hooks.on("updateActor", actor => touch(actor));
  Hooks.on("createItem", item => touch(item.parent));
  Hooks.on("updateItem", item => touch(item.parent));
  Hooks.on("deleteItem", item => touch(item.parent));
  Hooks.on("createActiveEffect", e => touch(e.parent?.documentName === "Actor" ? e.parent : e.parent?.parent));
  Hooks.on("updateActiveEffect", e => touch(e.parent?.documentName === "Actor" ? e.parent : e.parent?.parent));
  Hooks.on("deleteActiveEffect", e => touch(e.parent?.documentName === "Actor" ? e.parent : e.parent?.parent));

  // The whole encounter changes for everyone at once, so combat updates are
  // broadcast as a single, plain "combatChanged" ping the phones react to.
  const combatPing = () => {
    if (game.settings.get(MODULE_ID, "executorMode") === EXECUTOR_MODE.NEVER) return;
    game.socket.emit(SOCKET, { t: "evt", event: "combatChanged" });
  };
  for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
    Hooks.on(hook, combatPing);
  }
}

/* -------------------------------------------------------------- scene button */

Hooks.on("getSceneControlButtons", controls => {
  const tool = {
    name: "mobile-bridge",
    title: "FVTTMB.Menu.ConnectLabel",
    icon: "fas fa-mobile-screen",
    button: true,
    visible: true,
    onClick: () => renderConnectDialog(),
    onChange: () => renderConnectDialog()
  };
  // v13 uses an object keyed by control name, v12 and older use an array.
  if (Array.isArray(controls)) {
    const notes = controls.find(c => c.name === "notes") ?? controls[0];
    notes?.tools?.push(tool);
  } else if (controls?.notes?.tools) {
    controls.notes.tools["mobile-bridge"] = { ...tool, order: 99 };
  }
});

Hooks.once("ready", () => {
  if (!game.modules.get(MODULE_ID)?.active) warn("module inactive");
});

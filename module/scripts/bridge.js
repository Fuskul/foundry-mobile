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

  // v13 accepts ApplicationV2 subclasses; older cores need a FormApplication.
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
});

/* -------------------------------------------------------------------- ready */

Hooks.once("ready", () => {
  setVerbose(game.settings.get(MODULE_ID, "verbose"));
  game.socket.on(SOCKET, onSocket);
  registerChangeBroadcast();

  game.modules.get(MODULE_ID).api = {
    handlers: HANDLERS,
    protocol: PROTOCOL_VERSION,
    openConnectDialog: renderConnectDialog
  };

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

  debug("handling", message.action, "for", user.name, message.payload);
  const collected = captureNotifications();
  try {
    const data = await handler({ payload: message.payload ?? {}, user });
    reply(message, true, data ?? null, null, collected.stop());
  } catch (err) {
    error(message.action, err);
    reply(message, false, null, err?.message ?? String(err), collected.stop());
  }
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

import { getAdapter } from "./systems/index.js";
import { canUseActor } from "./executor.js";
import { MODULE_ID, PROTOCOL_VERSION } from "./constants.js";
import { safe } from "./systems/generic.js";

/**
 * All request handlers. Each receives ({ payload, user }) where `user` is the
 * Foundry User that sent the request, and returns plain JSON-safe data.
 */
export const HANDLERS = {
  /** Liveness + environment description. */
  async ping() {
    const adapter = getAdapter();
    return {
      protocol: PROTOCOL_VERSION,
      module: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
      foundry: game.version ?? game.data?.version,
      system: { id: game.system.id, title: game.system.title, version: game.system.version },
      world: { id: game.world.id, title: game.world.title },
      adapter: adapter.id,
      executor: { id: game.user.id, name: game.user.name, isGM: game.user.isGM },
      lang: game.i18n.lang
    };
  },

  /** Same as ping, but every eligible client answers so the app can pick one. */
  async discover(ctx) { return HANDLERS.ping(ctx); },

  /** System configuration tables the app needs to render pickers. */
  async config() {
    return safe(getAdapter().config());
  },

  /**
   * Actors the requesting user may open on their phone.
   * A GM can see every actor in the world, which on a large world is thousands
   * of entries, so the default scope is "the ones that are actually mine".
   */
  async actors({ payload, user }) {
    const scope = payload?.scope ?? "mine";
    const query = String(payload?.query ?? "").trim().toLowerCase();

    let list = game.actors.filter(a => canUseActor(user, a));

    if (scope === "mine") {
      // The character assigned to this user counts as theirs whatever the
      // permission table says, then anything they explicitly own.
      const assigned = user.character ? [user.character] : [];
      const owned = list.filter(a => a.testUserPermission(user, "OWNER"));
      const mine = [...new Set([...assigned, ...owned])];
      list = mine.length ? mine : list.filter(a => a.type === "character");
    } else if (scope === "characters") {
      list = list.filter(a => a.type === "character");
    }

    if (query) list = list.filter(a => a.name.toLowerCase().includes(query));

    return list
      .map(a => ({
        id: a.id,
        uuid: a.uuid,
        name: a.name,
        img: a.img,
        type: a.type,
        isPrimary: user.character?.id === a.id
      }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
      .slice(0, 200);
  },

  /** Full prepared sheet payload. */
  async sheet({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    return safe(await getAdapter().sheet(actor));
  },

  /** Write one whitelisted field on the actor or on one of its items. */
  async edit({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowEdits")) throw new Error("Editing is disabled by the GM");
    const adapter = getAdapter();
    if (!adapter.edit) throw new Error("This system adapter cannot edit");
    return safe(await adapter.edit(actor, {
      itemId: payload?.itemId,
      path: payload?.path,
      value: payload?.value,
      mode: payload?.mode ?? "set"
    }));
  },

  /** Buy or refund advances, doing the XP arithmetic on this side. */
  async advance({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowEdits")) throw new Error("Editing is disabled by the GM");
    const adapter = getAdapter();
    if (!adapter.advance) throw new Error("This system adapter has no advancement");
    return safe(await adapter.advance(actor, {
      kind: payload?.kind ?? "skill",
      key: payload?.key,
      itemId: payload?.itemId,
      target: payload?.target,
      delta: payload?.delta
    }));
  },

  /** Roll the defence of an opposed test on the phone's behalf. */
  async opposed({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowRolls")) throw new Error("Rolls are disabled by the GM");
    const adapter = getAdapter();
    if (!adapter.opposed) throw new Error("This system adapter has no opposed tests");
    return safe(await adapter.opposed(actor, {
      messageId: payload?.messageId,
      optionId: payload?.optionId,
      fields: payload?.fields
    }));
  },

  /** The buttons a card offers, named rather than drawn as icons. */
  async messageActions({ payload, user }) {
    const message = game.messages.get(String(payload?.messageId ?? ""));
    if (!message) throw new Error("Message not found");
    const adapter = getAdapter();
    return safe({
      messageId: message.id,
      opposed: adapter.opposedOptions?.(message, user) ?? null
    });
  },

  /**
   * What is actually switched on in this world. The phone shows only content
   * the active modules provide, so this doubles as a compatibility report and
   * as an explanation of why something is or is not on the sheet.
   */
  async modules() {
    const active = [];
    for (const module of game.modules) {
      if (!module.active) continue;
      const types = module.documentTypes ?? module.flags?.documentTypes ?? {};
      const systems = module.relationships?.systems;
      const forSystem = !systems?.size || [...systems].some(s => (s.id ?? s) === game.system.id);
      active.push({
        id: module.id,
        title: module.title,
        version: module.version,
        forSystem,
        itemTypes: Object.keys(types.Item ?? {}),
        actorTypes: Object.keys(types.Actor ?? {}),
        packs: (module.packs ?? []).length
      });
    }
    return {
      system: { id: game.system.id, version: game.system.version },
      foundry: game.version ?? game.data?.version,
      // Every item type the world knows about is renderable, because the phone
      // reads a module's items through the system's own placement API.
      supportedTypes: Object.keys(CONFIG.Item?.dataModels ?? {}),
      modules: active.sort((a, b) => a.title.localeCompare(b.title, game.i18n.lang))
    };
  },

  /** Use an item through the system's own item API (works for module types). */
  async useItem({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowRolls")) throw new Error("Rolls are disabled by the GM");
    const adapter = getAdapter();
    if (!adapter.useItem) throw new Error("This system adapter cannot use items");
    return safe(await adapter.useItem(actor, { itemId: payload?.itemId }));
  },

  /** Add or remove a condition. */
  async condition({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowEdits")) throw new Error("Editing is disabled by the GM");
    const adapter = getAdapter();
    if (!adapter.condition) throw new Error("This system adapter has no conditions");
    return safe(await adapter.condition(actor, { key: payload?.key, remove: payload?.remove }));
  },

  /** Recent chat, so a phone that was asleep can catch up. */
  async chatlog({ payload, user }) {
    const limit = Math.min(Math.max(Number(payload?.limit) || 60, 1), 200);
    const since = Number(payload?.since) || 0;
    return safe(game.messages.contents
      .filter(m => m.timestamp > since)
      .filter(m => m.visible ?? !(m.whisper?.length && !m.whisper.includes(user.id) && m.author?.id !== user.id))
      .slice(-limit)
      .map(m => ({
        _id: m.id,
        content: m.content,
        flavor: m.flavor,
        speaker: m.speaker,
        timestamp: m.timestamp,
        whisper: m.whisper ?? [],
        blind: !!m.blind,
        rolls: (m.rolls ?? []).map(r => ({ formula: r.formula, total: r.total })),
        opposed: getAdapter().opposedOptions?.(m, user) ?? null
      })));
  },

  /**
   * Press a button on a chat card. The card's own handlers live in this client,
   * so the reliable way to trigger one is to click it where it is rendered.
   */
  async cardAction({ payload, user }) {
    const messageId = String(payload?.messageId ?? "");
    const action = String(payload?.action ?? "");
    const index = Number(payload?.index ?? 0);
    if (!messageId || !action) throw new Error("Message or action missing");
    const message = game.messages.get(messageId);
    if (!message) throw new Error("Message not found");

    const root = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!root) throw new Error("That message is not on screen in the host client");
    const buttons = [...root.querySelectorAll(`[data-action="${action}"]`)];
    const button = buttons[index] ?? buttons[0];
    if (!button) throw new Error(`No "${action}" button on that card`);
    button.click();
    return { messageId, action, pressed: true, by: user.name };
  },

  /** Execute a real system test and post the normal chat card. */
  async roll({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    if (!game.settings.get(MODULE_ID, "allowRolls")) throw new Error("Rolls are disabled by the GM");
    return safe(await getAdapter().roll(actor, payload));
  },

  /** Adjust a whitelisted resource (wounds, advantage, fate...). */
  async resource({ payload, user }) {
    const actor = requireActor(payload?.actorId, user);
    const adapter = getAdapter();
    if (!adapter.setResource) throw new Error("This system adapter cannot change resources");
    return safe(await adapter.setResource(actor, payload.path, payload.value));
  },

  /** Post a chat message as the actor; /roll style commands are evaluated. */
  async chat({ payload, user }) {
    const actor = payload?.actorId ? requireActor(payload.actorId, user) : null;
    const content = String(payload?.content ?? "").slice(0, 5000).trim();
    if (!content) throw new Error("Empty message");

    const speaker = actor ? ChatMessage.getSpeaker({ actor }) : { alias: user.name };
    const command = /^\/(r|roll|gmroll|blindroll|selfroll|publicroll)\s+([\s\S]+)$/i.exec(content);
    let rollMode = payload?.rollMode ?? "publicroll";

    if (command) {
      const alias = command[1].toLowerCase();
      if (alias !== "r" && alias !== "roll") rollMode = alias;
      const roll = await new Roll(command[2], actor?.getRollData() ?? {}).evaluate();
      const message = await roll.toMessage(
        { speaker, author: user.id, user: user.id },
        { rollMode, create: true }
      );
      return { id: message?.id ?? null, total: roll.total, formula: roll.formula };
    }

    const message = await ChatMessage.create({
      content,
      speaker,
      author: user.id,
      user: user.id
    }, { rollMode });
    return { id: message?.id ?? null };
  },

  /** Current combat, if any. */
  async combat() {
    const combat = game.combat;
    if (!combat) return null;
    return safe({
      id: combat.id,
      round: combat.round,
      turn: combat.turn,
      started: combat.started,
      current: combat.combatant?.id ?? null,
      combatants: combat.turns.map(c => ({
        id: c.id,
        name: c.name,
        img: c.img,
        actorId: c.actorId,
        initiative: c.initiative,
        defeated: c.isDefeated,
        hidden: c.hidden,
        isOwner: c.isOwner
      }))
    });
  }
};

/** Ownership granted to this specific user, rather than inherited from the default. */
function ownsExplicitly(actor, user) {
  return (actor.ownership?.[user.id] ?? 0) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

function requireActor(actorId, user) {
  const actor = game.actors.get(actorId);
  if (!actor) throw new Error(`Actor ${actorId} not found`);
  if (!canUseActor(user, actor)) throw new Error(`${user.name} may not use ${actor.name}`);
  return actor;
}

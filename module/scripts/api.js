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
      const mine = list.filter(a => user.character?.id === a.id || ownsExplicitly(a, user));
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
    return safe(getAdapter().sheet(actor));
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

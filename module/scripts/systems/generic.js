/**
 * Fallback adapter. Knows nothing about a specific game system: it exposes raw
 * prepared data plus item lists so the app can still show *something*, and it can
 * post a plain formula roll to chat.
 */
export const genericAdapter = {
  id: "generic",

  matches() { return true; },

  config() {
    return { characteristics: {}, difficulties: {}, rollModes: rollModes() };
  },

  sheet(actor) {
    const items = {};
    for (const item of actor.items) {
      (items[item.type] ??= []).push({
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        system: safe(item.system)
      });
    }
    return {
      adapter: "generic",
      id: actor.id,
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      system: safe(actor.system),
      items,
      effects: actor.effects.map(e => ({ id: e.id, name: e.name, img: e.img, disabled: e.disabled }))
    };
  },

  async roll(actor, payload) {
    const formula = payload?.formula || "1d20";
    const roll = await new Roll(formula, actor.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: payload?.flavor || ""
    }, { rollMode: payload?.fields?.rollMode || game.settings.get("core", "rollMode") });
    return { total: roll.total, formula: roll.formula, result: roll.result };
  }
};

export function rollModes() {
  return {
    publicroll: game.i18n.localize("CHAT.RollPublic"),
    gmroll: game.i18n.localize("CHAT.RollPrivate"),
    blindroll: game.i18n.localize("CHAT.RollBlind"),
    selfroll: game.i18n.localize("CHAT.RollSelf")
  };
}

/** Strip anything that cannot survive structured cloning over the socket. */
export function safe(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return {}; }
}

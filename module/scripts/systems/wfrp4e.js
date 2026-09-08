import { safe, rollModes } from "./generic.js";

/** Order used on the mobile sheet, matching the desktop characteristic row. */
const CHAR_ORDER = ["ws", "bs", "s", "t", "i", "ag", "dex", "int", "wp", "fel"];

/** Hit locations, in the order the desktop sheet lays them out. */
const CORE_LOCATIONS = ["head", "body", "rArm", "lArm", "rLeg", "lLeg"];

/**
 * Modules and creature types add hit locations of their own (tails, wings,
 * extra limbs), so the human ones come first and anything else the actor
 * actually carries armour on follows.
 */
function hitLocations(armour) {
  const extra = Object.keys(armour ?? {})
    .filter(key => !CORE_LOCATIONS.includes(key) && armour[key] && typeof armour[key] === "object" && "value" in armour[key]);
  return [...CORE_LOCATIONS, ...extra];
}

const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const arr = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
const loc = k => (k ? game.i18n.localize(k) : "");
const clean = v => (v == null || v === "undefined" ? "" : String(v));

/** Item getters live on the document or its system model depending on version. */
function pick(item, name, fallback = "") {
  const value = item?.[name] ?? item?.system?.[name];
  return value ?? fallback;
}

/** Display strings for qualities/flaws; the raw arrays hold objects. */
function props(item, name) {
  const value = pick(item, name, null);
  return arr(value).map(v => (typeof v === "string" ? v : v?.display ?? v?.name ?? v?.value ?? "")).filter(Boolean);
}

/** The system's own summary text: description plus the property tags. */
async function summary(item, actor) {
  try {
    const data = await item.system.expandData?.({ secrets: actor?.isOwner ?? false });
    if (!data) return { description: descriptionOf(item), properties: [] };
    return {
      description: String(data.description?.value ?? descriptionOf(item)),
      properties: arr(data.properties).map(p => String(p).replace(/<[^>]*>/g, "").trim()).filter(Boolean)
    };
  } catch {
    return { description: descriptionOf(item), properties: [] };
  }
}

/**
 * Item types the sheet already shows somewhere. Anything else is either an
 * "aspect" — the extension point WFRP4e gives modules, which says for itself
 * which tab it belongs on — or an unknown type we still list rather than drop.
 */
const SHOWN_TYPES = new Set([
  "skill", "talent", "trait", "career", "weapon", "armour", "ammunition",
  "trapping", "container", "money", "spell", "prayer", "critical", "injury",
  "disease", "psychology", "mutation", "extendedTest"
]);

const PLACEMENTS = ["talents", "combat", "magic", "effects"];

/**
 * Items from modules, grouped the way the desktop sheet groups them: by the
 * tab the item's own model asks for and then by its plural name. Cants from
 * Archives III land in Magic, runes in Talents, and so on — without this bridge
 * knowing anything about those modules.
 */
async function aspectGroups(actor) {
  const groups = new Map();
  const aspects = actor.itemTags?.aspect ?? actor.items.filter(i => i.system?.placement);

  for (const item of aspects) {
    const placement = PLACEMENTS.includes(item.system?.placement) ? item.system.placement : "talents";
    const raw = item.system?.pluralLabel ?? item.system?.label ?? "";
    const translated = raw ? game.i18n.localize(raw) : "";
    const label = (translated && translated !== raw) ? translated : typeName(item.type);
    const key = `${placement}::${label}`;
    if (!groups.has(key)) groups.set(key, { placement, label, type: item.type, items: [] });
    groups.get(key).items.push(item);
  }

  const out = { talents: [], combat: [], magic: [], effects: [] };
  for (const group of groups.values()) {
    out[group.placement].push({
      type: group.type,
      label: group.label,
      items: await Promise.all(group.items
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map(async i => ({
          id: i.id,
          name: i.name,
          img: i.img,
          type: i.type,
          note: clean(loc(i.system?.listHeader) || ""),
          usable: !!i.system?.usable,
          ...(await summary(i, actor))
        })))
    });
  }
  return out;
}

/** Items of a type nothing claims — still shown, never silently dropped. */
async function extraItems(actor) {
  const known = new Set((actor.itemTags?.aspect ?? []).map(i => i.id));
  const groups = new Map();
  for (const i of actor.items) {
    if (SHOWN_TYPES.has(i.type) || known.has(i.id)) continue;
    if (!groups.has(i.type)) groups.set(i.type, []);
    groups.get(i.type).push(i);
  }

  const out = [];
  for (const [type, items] of groups) {
    out.push({
      type,
      label: typeName(type),
      items: await Promise.all(items
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map(async i => ({
          id: i.id,
          name: i.name,
          img: i.img,
          type: i.type,
          quantity: n(i.system?.quantity?.value, null),
          usable: !!i.system?.usable,
          ...(await summary(i, actor))
        })))
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

/** The world's own name for an item type, or the raw type when it has none. */
function typeName(type) {
  for (const key of [`TYPES.Item.${type}`, `ITEM.Type${type.charAt(0).toUpperCase()}${type.slice(1)}`]) {
    const text = game.i18n.localize(key);
    if (text && text !== key) return text;
  }
  return type;
}

/**
 * Everything the sheet does not show elsewhere, grouped by item type. Official
 * modules add types of their own — runes (Dwarfs), techniques (High Elves),
 * chanties (Sea of Claws), cants (Archives III) — as do third-party compendia,
 * and each gets its own section named the way that module names it.
 */
async function extraItems(actor) {
  const groups = new Map();
  for (const i of actor.items) {
    if (SHOWN_TYPES.has(i.type)) continue;
    if (!groups.has(i.type)) groups.set(i.type, []);
    groups.get(i.type).push(i);
  }

  const out = [];
  for (const [type, items] of groups) {
    out.push({
      type,
      label: typeName(type),
      items: await Promise.all(items
        .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        .map(async i => ({
          id: i.id,
          name: i.name,
          img: i.img,
          type: i.type,
          quantity: n(i.system?.quantity?.value, null),
          usable: !!i.system?.usable,
          ...(await summary(i, actor))
        })))
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
}

function descriptionOf(item) {
  const raw = item?.system?.description?.value ?? "";
  return typeof raw === "string" ? raw : "";
}

/**
 * Section and field names taken from Foundry's own localisation, so the phone
 * shows exactly the terms the player sees at the table — including whatever
 * translation module the world uses. Keys that the world cannot translate are
 * left out and the app falls back to its own wording.
 */
const LABEL_KEYS = {
  wounds: "Wounds", advantage: "Advantage", fate: "Fate", fortune: "Fortune",
  resilience: "Resilience", resolve: "Resolve", corruption: "Corruption", sin: "Sin",
  movement: "Movement", encumbrance: "Encumbrance", experience: "Experience",
  main: "Main", skills: "Skills", basicSkills: "Basic Skills",
  advancedSkills: "Grouped & Advanced Skills", talents: "Talents", traits: "Traits",
  combat: "Combat", effects: "Effects", magic: "Magic", religion: "Religion",
  trappings: "Trappings", notes: "Notes", armour: "Armour", money: "Money",
  careers: "Careers", career: "Career", status: "Status", species: "Species",
  gender: "Gender", blessing: "Blessing", miracle: "Miracle", injury: "Injury",
  criticals: "Criticals", psychology: "Psychology", disease: "Disease",
  mutation: "Corruption&Mutation", qualities: "Qualities", flaws: "Flaws",
  damage: "Damage", range: "Range", target: "Target", duration: "Duration",
  equipped: "Equipped", worn: "Worn", quantity: "Quantity", total: "Total",
  charAbbrev: "SHEET.CharAbbrev", advAbbrev: "SHEET.AdvAbbrev", ap: "AP",
  successLevels: "SuccessLevels", extendedTests: "Extended Tests",
  pettySpell: "SHEET.PettySpell", loreSpell: "SHEET.LoreSpell", cants: "SHEET.Cants",
  blessedBy: "Blessed By", memorized: "Memorized", initial: "Initial",
  advances: "Advances", modifier: "Modifier", current: "Current", complete: "Complete",
  meleeWeapons: "SHEET.MeleeWeapons", rangedWeapons: "SHEET.RangedWeapons",
  conditions: "SHEET.Conditions", biography: "Biography", motivation: "Motivation",
  criticalWounds: "Critical Wounds", ammunition: "Ammunition"
};

function labels() {
  const out = {};
  for (const [name, key] of Object.entries(LABEL_KEYS)) {
    const text = game.i18n.localize(key);
    if (text && text !== key) out[name] = text;
  }
  return out;
}

export const wfrp4eAdapter = {
  id: "wfrp4e",

  matches() { return game.system.id === "wfrp4e"; },

  config() {
    const cfg = game.wfrp4e?.config ?? {};
    return {
      characteristics: cfg.characteristics ?? {},
      characteristicsAbbrev: cfg.characteristicsAbbrev ?? {},
      difficultyModifiers: cfg.difficultyModifiers ?? {},
      difficultyLabels: cfg.difficultyLabels ?? {},
      hitLocations: cfg.locations ?? {},
      conditions: cfg.conditions ?? {},
      magicLores: cfg.magicLores ?? {},
      weaponGroups: cfg.weaponGroups ?? {},
      trappingTypes: cfg.trappingTypes ?? {},
      rollModes: rollModes()
    };
  },

  /* ------------------------------------------------------------------ sheet */

  async sheet(actor) {
    const sys = actor.system ?? {};
    const st = sys.status ?? {};
    const det = sys.details ?? {};
    const auto = sys.autoCalc ?? {};

    // One broken item must not take the whole sheet down with it.
    const [skills, talents, traits, weapons, armourItems, spells, prayers, ailments, inventory, extendedTests, careers] =
      await Promise.all([
        guard("skills", () => skillLists(actor), { basic: [], advanced: [] }),
        guard("talents", () => talentList(actor), []),
        guard("traits", () => traitList(actor), []),
        guard("weapons", () => weaponList(actor), []),
        guard("armour", () => armourList(actor), []),
        guard("spells", () => spellLists(actor), { petty: [], lore: [] }),
        guard("prayers", () => prayerLists(actor), { blessing: [], miracle: [] }),
        guard("ailments", () => ailmentList(actor), []),
        guard("inventory", () => inventoryFor(actor), { categories: [], containers: [], money: { total: 0, items: [] } }),
        guard("extendedTests", () => extendedTestList(actor), []),
        guard("careers", () => careerList(actor), [])
      ]);

    return {
      adapter: "wfrp4e",
      labels: labels(),
      id: actor.id,
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      isOwner: actor.isOwner,
      isGM: game.user.isGM,

      details: {
        species: clean(det.species?.value),
        subspecies: clean(det.species?.subspecies),
        gender: clean(det.gender?.value),
        career: clean(det.career?.name ?? det.career?.value),
        careerClass: clean(det.career?.class?.value ?? det.class?.value),
        careerGroup: clean(det.career?.careergroup?.value),
        careerLevel: clean(det.careerlevel?.value),
        statusText: clean(det.status?.value),
        statusStanding: det.status?.standing ?? "",
        statusModifier: n(det.status?.modifier),
        god: clean(det.god?.value),
        age: clean(det.age?.value),
        height: clean(det.height?.value),
        weight: clean(det.weight?.value),
        hairColour: clean(det.haircolour?.value),
        eyeColour: clean(det.eyecolour?.value),
        distinguishingMark: clean(det.distinguishingmark?.value),
        starSign: clean(det.starsign?.value),
        size: clean(det.size?.value),
        motivation: clean(det.motivation?.value),
        move: {
          value: n(det.move?.value),
          walk: n(det.move?.walk),
          run: n(det.move?.run),
          autoWalk: !!auto.walk,
          autoRun: !!auto.run
        },
        experience: {
          total: n(det.experience?.total),
          spent: n(det.experience?.spent),
          current: n(det.experience?.current, n(det.experience?.total) - n(det.experience?.spent))
        },
        ambitions: {
          personalShort: clean(det["personal-ambitions"]?.["short-term"]),
          personalLong: clean(det["personal-ambitions"]?.["long-term"]),
          partyShort: clean(det["party-ambitions"]?.["short-term"]),
          partyLong: clean(det["party-ambitions"]?.["long-term"])
        },
        biography: clean(det.biography?.value),
        gmnotes: game.user.isGM ? clean(det.gmnotes?.value) : ""
      },

      characteristics: CHAR_ORDER.filter(k => sys.characteristics?.[k]).map(key => {
        const c = sys.characteristics[key];
        return {
          key,
          label: loc(c.label) || key.toUpperCase(),
          abbrev: loc(c.abrev) || key.toUpperCase(),
          initial: n(c.initial),
          advances: n(c.advances),
          modifier: n(c.modifier),
          value: n(c.value, n(c.initial) + n(c.advances)),
          bonus: n(c.bonus, Math.floor(n(c.value) / 10)),
          inCareer: !!c.career,
          cost: n(c.cost, null),
          complete: !!c.complete
        };
      }),

      status: {
        wounds: { value: n(st.wounds?.value), max: n(st.wounds?.max), auto: !!auto.wounds, label: loc(st.wounds?.label) },
        advantage: { value: n(st.advantage?.value), max: n(st.advantage?.max, 10) },
        fate: { value: n(st.fate?.value) },
        fortune: { value: n(st.fortune?.value) },
        resilience: { value: n(st.resilience?.value) },
        resolve: { value: n(st.resolve?.value) },
        corruption: { value: n(st.corruption?.value), max: n(st.corruption?.max), auto: !!auto.corruption },
        sin: { value: n(st.sin?.value) },
        criticalWounds: {
          value: actor.itemTypes.critical.filter(c => Number.isFinite(Number(c.system?.wounds?.value))).length,
          max: n(st.criticalWounds?.max),
          auto: !!auto.criticals
        },
        encumbrance: {
          current: n(st.encumbrance?.current),
          max: n(st.encumbrance?.max),
          state: Number(st.encumbrance?.state ?? 0),
          auto: !!auto.encumbrance
        },
        armour: armourPoints(actor)
      },

      careers,
      skills,
      talents,
      traits,
      weapons,
      armourItems,
      spells,
      prayers,
      ailments,
      inventory,
      extendedTests,
      effects: await guard("effects", () => effectList(actor), { temporary: [], passive: [], disabled: [] }),
      conditions: await guard("conditions", () => conditionList(actor), []),
      experienceLog: await guard("experienceLog", () => experienceLog(actor), []),
      extras: await guard("extras", () => extraItems(actor), []),
      aspects: await guard("aspects", () => aspectGroups(actor), { talents: [], combat: [], magic: [], effects: [] }),
      hasSpells: !!actor.itemTypes.spell.length || !!(actor.itemTags?.aspect ?? []).some(i => i.system?.placement === "magic"),
      hasPrayers: !!actor.itemTypes.prayer.length
    };
  },

  /* ------------------------------------------------------------------- roll */

  async roll(actor, payload) {
    const kind = payload?.kind ?? "characteristic";
    const key = payload?.key;
    const context = {
      skipDialog: payload?.skipDialog !== false,
      fields: cleanFields(payload?.fields ?? {}),
      // No marker on the card: a roll from the phone should be indistinguishable
      // from one made at the table.
      appendTitle: payload?.appendTitle ?? ""
    };
    const options = { skipTargets: payload?.skipTargets === true };

    let test;
    switch (kind) {
      case "characteristic":
        test = await actor.setupCharacteristic(key, context, options);
        break;
      case "skill": {
        const item = actor.items.get(key) ?? key;
        test = await actor.setupSkill(item, context, options);
        break;
      }
      case "weapon":
        test = await actor.setupWeapon(need(actor, key, "weapon"), context, options);
        break;
      case "trait":
        test = await actor.setupTrait(need(actor, key, "trait"), context, options);
        break;
      case "cast":
        test = await actor.setupCast(need(actor, key, "spell"), context, options);
        break;
      case "channel":
        test = await actor.setupChannell(need(actor, key, "spell"), context, options);
        break;
      case "prayer":
        test = await actor.setupPrayer(need(actor, key, "prayer"), context, options);
        break;
      case "extended":
        return { extended: true, done: !!(await actor.setupExtendedTest(need(actor, key, "extendedTest"), context, options)) };
      case "item":
        test = await actor.setupItem(key, context, options);
        break;
      default:
        throw new Error(`Unknown roll kind: ${kind}`);
    }

    if (!test) return { cancelled: true };
    await test.roll();
    return summarise(test);
  },

  /* --------------------------------------------------------------- resource */

  async setResource(actor, path, value) {
    if (!isActorPathAllowed(path)) throw new Error(`Path not allowed: ${path}`);
    await actor.update({ [path]: Number(value) });
    return { path, value: Number(value) };
  },

  /* ---------------------------------------------------------------- editing */

  /** Write one whitelisted field on the actor or on one of its items. */
  async edit(actor, { itemId, path, value, mode = "set" }) {
    const target = itemId ? need(actor, itemId, "item") : actor;
    const allowed = itemId ? isItemPathAllowed(path) : isActorPathAllowed(path);
    if (!allowed) throw new Error(`Path not allowed: ${path}`);

    // Advances cost experience: never write them raw, or the system opens its
    // confirmation dialog on whichever browser is bridging.
    const isAdvance = path === "system.advances.value" || /^system\.characteristics\.[a-z]+\.advances$/.test(path);
    if (isAdvance && actor.type === "character") {
      const current = n(foundry.utils.getProperty(target, path));
      const wanted = mode === "step" ? current + n(value, 1) : n(value);
      return this.advance(actor, {
        kind: itemId ? "skill" : "characteristic",
        key: itemId ? undefined : path.split(".")[2],
        itemId,
        target: wanted
      });
    }

    let next = value;
    if (mode === "toggle") next = !foundry.utils.getProperty(target, path);
    else if (mode === "step") next = n(foundry.utils.getProperty(target, path)) + n(value, 1);

    if (mode === "step" || typeof foundry.utils.getProperty(target, path) === "number") next = Math.max(0, n(next));

    await target.update({ [path]: next });
    return { itemId: itemId ?? null, path, value: next };
  },

  /**
   * Buy or refund advances the way the desktop sheet does it: work out the XP,
   * write the advance, the spent total and the log in one update, and tell the
   * system to skip its own confirmation dialog — otherwise that dialog opens on
   * whichever browser is acting as the bridge, not on the phone that asked.
   */
  async advance(actor, { kind, key, itemId, target, delta }) {
    if (actor.type !== "character") throw new Error("Only characters spend experience");

    const system = actor.system.toObject();
    const experience = system.details.experience;
    const update = { items: [] };
    let from, to, name, type, modifier;

    if (kind === "talent") {
      const talent = need(actor, itemId, "talent");
      const advances = n(talent.system.Advances ?? talent.system.advances?.value);
      const max = talent.system.Max;
      if (max !== "-" && Number.isFinite(Number(max)) && advances >= Number(max)) {
        throw new Error(game.i18n.format("ACTOR.AdvancementError", {
          action: game.i18n.localize("ACTOR.ErrorImprove"),
          item: talent.name
        }));
      }
      const cost = (advances + 1) * 100;
      const spent = n(experience.spent) + cost;
      if (n(experience.total) - spent < 0) {
        throw new Error(game.i18n.format("ACTOR.AdvancementError", {
          action: game.i18n.localize("ACTOR.ErrorImprove"),
          item: talent.name
        }));
      }
      await actor.update({
        "system.details.experience.spent": spent,
        "system.details.experience.log": actor.system.addToExpLog(cost, talent.name, spent)
      }, { skipExperienceChecks: true });
      await actor.createEmbeddedDocuments("Item", [talent.toObject()]);
      return { from: advances, to: advances + 1, cost, spent, name: talent.name };
    }

    if (kind === "characteristic") {
      const characteristic = system.characteristics?.[key];
      if (!characteristic) throw new Error(`Unknown characteristic: ${key}`);
      from = n(characteristic.advances);
      modifier = n(actor.system.characteristics[key]?.costModifier);
      name = game.wfrp4e?.config?.characteristics?.[key] ?? key;
      type = "characteristic";
    } else {
      const skill = need(actor, itemId, "skill");
      if (skill.type !== "skill") throw new Error("Only skills advance this way");
      from = n(skill.system.advances?.value);
      modifier = n(skill.system.advances?.costModifier);
      name = skill.name;
      type = "skill";
    }

    to = Number.isFinite(Number(target)) ? Math.max(0, Math.round(Number(target))) : from + n(delta, 1);
    if (to === from) return { from, to, cost: 0 };

    const cost = advanceRangeCost(from, to, type, modifier);
    const spent = n(experience.spent) + cost;
    if (n(experience.total) - spent < 0) {
      throw new Error(game.i18n.format("ACTOR.AdvancementError", {
        action: game.i18n.localize("ACTOR.ErrorImprove"),
        item: name
      }));
    }

    experience.spent = spent;
    experience.log = actor.system.addToExpLog(cost, name, spent);

    if (kind === "characteristic") system.characteristics[key].advances = to;
    else update.items.push({ _id: itemId, "system.advances.value": to });

    update.system = system;
    await actor.update(update, { skipExperienceChecks: true });
    return { from, to, cost, spent, name };
  },

  /**
   * Answer an opposed test as the defender. The system would normally open its
   * roll dialog on the client that presses the card button, so the phone sends
   * its own choices and the test runs here without a dialog.
   */
  async opposed(actor, { messageId, optionId, fields }) {
    const message = game.messages.get(messageId);
    const handler = message?.system?.opposedHandler;
    if (!handler) throw new Error("That message is not an opposed test");

    const defender = handler.defender;
    if (!defender) throw new Error("This opposed test has no defender yet");
    if (defender.id !== actor.id) throw new Error(`${actor.name} is not the defender of that test`);

    if (optionId === "unopposed") {
      await handler.resolveUnopposed();
      return { messageId, optionId, resolved: true };
    }

    const context = { skipTargets: true, skipDialog: true, fields: cleanFields(fields ?? {}) };
    const test = optionId === "dodge"
      ? await defender.setupSkill(game.i18n.localize("NAME.Dodge"), context)
      : await defender.setupItem(optionId, context);
    if (!test) throw new Error("The system did not build that test");
    await test.roll();
    return { messageId, optionId, resolved: true };
  },

  /** The defence options this card offers, with names the phone can show. */
  opposedOptions(message, user) {
    const handler = message?.system?.opposedHandler;
    if (!handler) return null;
    const defender = handler.defender;
    if (!defender) return null;
    return {
      defender: { id: defender.id, name: defender.name },
      canAct: defender.testUserPermission(user, "OWNER") || user.character?.id === defender.id,
      options: (handler.getOpposedOptions?.(defender) ?? []).map(o => ({
        id: o.id,
        label: o.tooltip,
        icon: o.icon
      }))
    };
  },

  /**
   * Use an item the way its own module intends. WFRP4e gives every item type an
   * "aspect" API, so a blood gift, a mutation or anything a third-party module
   * adds can be used from the phone without this bridge knowing what it is.
   */
  async useItem(actor, { itemId }) {
    const item = need(actor, itemId, "item");
    if (!item.system?.usable) throw new Error(`${item.name} cannot be used`);
    const result = await item.system.use({});
    if (result?.roll) await result.roll();
    return { itemId, name: item.name, used: true };
  },

  /** Add or remove a WFRP condition. */
  async condition(actor, { key, remove }) {
    if (!key) throw new Error("No condition given");
    if (remove) await actor.removeCondition(key);
    else await actor.addCondition(key);
    return { key, remove: !!remove };
  }
};

/* -------------------------------------------------------------------------- */

/** XP cost of one advance, mirroring the system's own table lookup. */
function advanceCost(currentAdvances, type, modifier = 0) {
  const table = game.wfrp4e?.config?.xpCost?.[type] ?? [];
  if (!table.length) return 0;
  const index = Math.max(0, Math.floor(currentAdvances / 5));
  return (index >= table.length ? table[table.length - 1] : table[index]) + n(modifier);
}

/** Total cost of moving between two advance counts; negative when refunding. */
function advanceRangeCost(start, end, type, modifier = 0) {
  let sign = 1;
  if (end < start) { sign = -1; [start, end] = [end, start]; }
  let cost = 0;
  for (let i = start; i < end; i++) cost += advanceCost(i, type, modifier);
  return cost * sign;
}

/** Run one section of the sheet, falling back rather than failing the request. */
async function guard(label, build, fallback) {
  try { return await build(); }
  catch (err) {
    console.warn(`[MobileBridge] sheet section "${label}" failed:`, err);
    return fallback;
  }
}

function need(actor, id, type) {
  const item = actor.items.get(id);
  if (!item) throw new Error(`${type} ${id} not found on ${actor.name}`);
  return item;
}

function byType(actor, type) {
  return actor.itemTypes?.[type] ?? actor.items.filter(i => i.type === type);
}

const ACTOR_PATHS = [
  /^system\.characteristics\.(ws|bs|s|t|i|ag|dex|int|wp|fel)\.(initial|advances|modifier)$/,
  /^system\.status\.(wounds|advantage|fate|fortune|resilience|resolve|corruption|sin|criticalWounds|encumbrance)\.(value|max)$/,
  /^system\.details\.(experience\.(total|spent)|move\.(value|walk|run)|god\.value|motivation\.value|biography\.value|status\.modifier)$/,
  /^system\.details\.(personal|party)-ambitions\.(short|long)-term$/
];

const ITEM_PATHS = [
  /^system\.(advances|quantity|equipped|worn|memorized|current|complete|diagnosed|countEnc|offhand)\.value$/,
  /^system\.(disabled)$/,
  /^system\.(currentAmmo|currentIng|spellIngredient|location)\.value$/,
  /^system\.loaded\.(value|amt)$/,
  /^system\.cn\.SL$/,
  /^system\.SL\.current$/,
  /^system\.duration\.value$/,
  /^system\.damageToItem\.value$/,
  /^system\.APdamage\.(head|body|rArm|lArm|rLeg|lLeg)$/,
  /^system\.lore\.chosen$/
];

const isActorPathAllowed = path => ACTOR_PATHS.some(re => re.test(path));
const isItemPathAllowed = path => ITEM_PATHS.some(re => re.test(path));

/* ------------------------------------------------------------------ sections */

async function careerList(actor) {
  return Promise.all(byType(actor, "career").map(async c => ({
    id: c.id, name: c.name, img: c.img,
    current: !!c.system.current?.value,
    complete: !!c.system.complete?.value,
    level: clean(c.system.level?.value),
    careerGroup: clean(c.system.careergroup?.value),
    status: clean(c.system.status?.standing ? `${c.system.status?.tier} ${c.system.status?.standing}` : ""),
    ...(await summary(c, actor))
  })));
}

async function skillLists(actor) {
  const list = await Promise.all(byType(actor, "skill").map(async s => ({
    id: s.id,
    name: s.name,
    img: s.img,
    characteristic: clean(s.system.characteristic?.value),
    characteristicLabel: game.wfrp4e?.config?.characteristicsAbbrev?.[s.system.characteristic?.value] ?? "",
    characteristicValue: n(s.characteristic?.value ?? s.system.characteristic?.num),
    advances: n(s.system.advances?.value),
    modifier: n(s.system.modifier?.value),
    total: n(s.system.total?.value),
    advanced: (s.system.advanced?.value ?? "bsc") === "adv",
    grouped: clean(s.system.grouped?.value),
    cost: n(s.system.cost, null),
    canAdvance: !!s.system.advances?.indicator,
    complete: !!s.system.advances?.complete,
    ...(await summary(s, actor))
  })));
  const sorted = list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return {
    basic: sorted.filter(s => !s.advanced && s.grouped !== "isSpec"),
    advanced: sorted.filter(s => s.advanced || s.grouped === "isSpec")
  };
}

async function talentList(actor) {
  // The desktop sheet shows one row per distinct talent name.
  const seen = new Map();
  for (const t of byType(actor, "talent")) if (!seen.has(t.name)) seen.set(t.name, t);
  return Promise.all([...seen.values()].map(async t => ({
    id: t.id, name: t.name, img: t.img,
    advances: n(pick(t, "Advances", t.system.advances?.value)),
    max: pick(t, "Max", t.system.max?.value),
    tests: clean(t.system.tests?.value),
    canAdvance: !!t.system.advances?.indicator,
    cost: n(t.system.cost, null),
    ...(await summary(t, actor))
  })));
}

async function traitList(actor) {
  return Promise.all(byType(actor, "trait").map(async t => ({
    id: t.id, name: clean(t.system.DisplayName ?? t.name), img: t.img,
    rollable: !!t.system.rollable?.value,
    disabled: !!t.system.disabled,
    specification: clean(t.system.specification?.value),
    ...(await summary(t, actor))
  })));
}

async function weaponList(actor) {
  return Promise.all(byType(actor, "weapon").map(async w => ({
    id: w.id,
    name: w.name,
    img: w.img,
    equipped: !!w.system.isEquipped,
    melee: !!w.system.isMelee,
    ranged: !!w.system.isRanged,
    group: clean(w.system.weaponGroup?.value),
    groupLabel: clean(pick(w, "WeaponGroup", game.wfrp4e?.config?.weaponGroups?.[w.system.weaponGroup?.value])),
    damage: clean(pick(w, "DamageString", w.system.damage?.value)),
    reach: clean(pick(w, "Reach", w.system.reach?.value)),
    range: clean(pick(w, "Range", w.system.range?.value)),
    twoHanded: !!w.system.twohanded?.value,
    offhand: !!w.system.offhand?.value,
    damageToItem: n(w.system.damageToItem?.value),
    qualities: props(w, "Qualities"),
    flaws: props(w, "Flaws"),
    unusedQualities: props(w, "UnusedQualities"),
    loading: !!w.system.loading,
    loaded: { value: !!w.system.loaded?.value, amt: n(w.system.loaded?.amt), max: n(w.system.loaded?.max) },
    currentAmmo: clean(w.system.currentAmmo?.value),
    ammoList: arr(w.system.ammoList ?? w.ammoList).map(a => ({ id: a._id ?? a.id, name: a.name })),
    skill: clean(w.system.skillToUse?.name),
    quantity: n(w.system.quantity?.value),
    encumbrance: Number(w.system.encumbrance?.total ?? 0),
    ...(await summary(w, actor))
  })));
}

async function armourList(actor) {
  return Promise.all(byType(actor, "armour").map(async a => ({
    id: a.id, name: a.name, img: a.img,
    equipped: !!a.system.isEquipped,
    type: clean(a.system.armorType?.value),
    penalty: clean(a.system.penalty?.value),
    qualities: props(a, "Qualities"),
    flaws: props(a, "Flaws"),
    protects: safe(a.system.protects ?? {}),
    ap: safe(a.system.AP ?? {}),
    currentAP: safe(a.system.currentAP ?? {}),
    apDamage: safe(a.system.APdamage ?? {}),
    quantity: n(a.system.quantity?.value),
    encumbrance: Number(a.system.encumbrance?.total ?? 0),
    ...(await summary(a, actor))
  })));
}

async function spellLists(actor) {
  const all = await Promise.all(byType(actor, "spell").map(async s => {
    const lores = arr(s.system.lore?.value);
    return {
      id: s.id, name: s.name, img: s.img,
      petty: lores.includes("petty"),
      cant: lores.includes("cant"),
      lores: lores.map(l => ({ key: l, label: game.wfrp4e?.config?.magicLores?.[l] ?? l })),
      chosenLore: clean(s.system.lore?.chosen),
      cn: n(s.system.cn?.value),
      channelled: n(s.system.cn?.SL),
      memorized: !!s.system.memorized?.value,
      range: clean(pick(s, "Range", s.system.range?.value)),
      target: clean(pick(s, "Target", s.system.target?.value)),
      duration: clean(pick(s, "Duration", s.system.duration?.value)),
      damage: clean(pick(s, "Damage", s.system.damage?.value)),
      magicMissile: !!s.system.magicMissile?.value,
      currentIng: clean(s.system.currentIng?.value),
      ingredients: arr(s.system.ingredientList).map(i => ({ id: i.id ?? i._id, name: i.name })),
      ...(await summary(s, actor))
    };
  }));
  const sorted = all.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return {
    petty: sorted.filter(s => s.petty),
    cants: sorted.filter(s => s.cant),
    lore: sorted.filter(s => !s.petty && !s.cant)
  };
}

async function prayerLists(actor) {
  const all = await Promise.all(byType(actor, "prayer").map(async p => ({
    id: p.id, name: p.name, img: p.img,
    kind: clean(p.system.type?.value) || "blessing",
    god: clean(p.system.god?.value),
    range: clean(pick(p, "Range", p.system.range?.value)),
    target: clean(pick(p, "Target", p.system.target?.value)),
    duration: clean(pick(p, "Duration", p.system.duration?.value)),
    damage: clean(pick(p, "DamageString", p.system.damage?.value)),
    ...(await summary(p, actor))
  })));
  const sorted = all.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return {
    blessing: sorted.filter(p => p.kind === "blessing"),
    miracle: sorted.filter(p => p.kind !== "blessing")
  };
}

async function ailmentList(actor) {
  const out = [];
  for (const type of ["critical", "injury", "disease", "psychology", "mutation"]) {
    for (const i of byType(actor, type)) {
      if (type === "disease" && !game.user.isGM && !i.system.show) continue;
      out.push({
        id: i.id, name: i.name, img: i.img, kind: type,
        location: clean(i.system.location?.value),
        duration: i.system.duration?.permanent
          ? game.i18n.localize("Permanent")
          : [n(i.system.duration?.value, null), clean(i.system.duration?.unit)].filter(v => v !== null && v !== "").join(" "),
        incubation: [n(i.system.incubation?.value, null), clean(i.system.incubation?.unit)].filter(v => v !== null && v !== "").join(" "),
        diagnosed: !!i.system.diagnosed,
        ...(await summary(i, actor))
      });
    }
  }
  return out;
}

async function extendedTestList(actor) {
  return Promise.all(byType(actor, "extendedTest").map(async e => ({
    id: e.id, name: e.name, img: e.img,
    test: clean(e.system.test?.value),
    current: n(e.system.SL?.current),
    target: n(e.system.SL?.target),
    ...(await summary(e, actor))
  })));
}

/**
 * Reuse the system's own inventory builder so categories, containers and money
 * come out exactly as they do on the desktop sheet.
 */
async function inventoryFor(actor) {
  let built = null;
  try { built = actor.sheet?.prepareInventory?.(); } catch { built = null; }
  if (!built) return fallbackInventory(actor);

  const item = async i => ({
    id: i.id, name: i.name, img: i.img, type: i.type,
    quantity: n(i.system?.quantity?.value),
    encumbrance: Number(i.system?.encumbrance?.total ?? 0),
    equipped: !!(i.system?.isEquipped ?? i.system?.equipped?.value),
    coinValue: n(i.system?.coinValue?.value, null),
    ...(await summary(i, actor))
  });

  const categories = [];
  for (const [key, cat] of Object.entries(built.categories ?? {})) {
    if (!cat?.show) continue;
    categories.push({
      key,
      label: clean(cat.label),
      dataType: clean(cat.dataType),
      toggle: !!cat.toggle,
      toggleName: clean(cat.toggleName),
      items: await Promise.all((cat.items ?? []).map(item))
    });
  }

  const containers = await Promise.all((built.containers?.items ?? []).map(async c => ({
    id: c.id, name: c.name, img: c.img,
    carries: { current: Number(c.system?.carries?.current ?? 0), max: Number(c.system?.carries?.value ?? 0) },
    countEnc: !!c.system?.countEnc?.value,
    wearable: !!c.system?.wearable?.value,
    equipped: !!c.system?.equipped?.value,
    encumbrance: Number(c.system?.encumbrance?.total ?? 0),
    contents: await Promise.all((c.system?.carrying ?? []).map(item))
  })));

  return {
    categories,
    containers,
    money: {
      total: n(built.money?.total),
      items: await Promise.all((built.money?.items ?? []).map(item))
    }
  };
}

/** If the sheet class is unavailable, group items ourselves. */
async function fallbackInventory(actor) {
  const groups = new Map();
  for (const i of actor.items) {
    if (!["weapon", "armour", "ammunition", "trapping", "container", "money"].includes(i.type)) continue;
    const key = i.type === "trapping" ? (i.system.trappingType?.value || "misc") : i.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  const categories = [];
  for (const [key, items] of groups) {
    if (key === "money") continue;
    categories.push({
      key,
      label: key,
      dataType: key,
      toggle: ["weapon", "armour"].includes(key),
      toggleName: "",
      items: await Promise.all(items.map(async i => ({
        id: i.id, name: i.name, img: i.img, type: i.type,
        quantity: n(i.system.quantity?.value),
        encumbrance: Number(i.system.encumbrance?.total ?? 0),
        equipped: !!(i.system.isEquipped ?? i.system.equipped?.value),
        ...(await summary(i, actor))
      })))
    });
  }
  const money = byType(actor, "money");
  return {
    categories,
    containers: [],
    money: {
      total: money.reduce((sum, m) => sum + n(m.system.coinValue?.value) * n(m.system.quantity?.value), 0),
      items: await Promise.all(money.map(async m => ({
        id: m.id, name: m.name, img: m.img, type: m.type,
        quantity: n(m.system.quantity?.value),
        coinValue: n(m.system.coinValue?.value),
        encumbrance: Number(m.system.encumbrance?.total ?? 0),
        ...(await summary(m, actor))
      })))
    }
  };
}

function armourPoints(actor) {
  const src = actor.system?.status?.armour ?? {};
  const out = { shield: n(src.shield), shieldDamage: n(src.shieldDamage), locations: [] };
  for (const key of hitLocations(src)) {
    const value = src[key];
    if (!value || value.show === false) continue;
    out.locations.push({
      key,
      label: clean(value.label) || game.wfrp4e?.config?.locations?.[key] || key,
      value: n(value.value),
      layers: arr(value.layers).map(l => clean(l.value ?? l.source ?? l.name)).filter(Boolean)
    });
  }
  return out;
}

function effectList(actor) {
  const bucket = e => (e.disabled ? "disabled" : (e.isTemporary || e.duration?.rounds || e.duration?.seconds) ? "temporary" : "passive");
  const out = { temporary: [], passive: [], disabled: [] };
  for (const e of actor.effects) {
    if (e.statuses?.size || e.flags?.core?.statusId) continue; // conditions are listed separately
    out[bucket(e)].push({
      id: e.id,
      name: clean(e.name ?? e.label),
      img: clean(e.img ?? e.icon),
      source: clean(e.sourceName ?? e.origin ?? ""),
      disabled: !!e.disabled,
      description: clean(e.description)
    });
  }
  return out;
}

function conditionList(actor) {
  const config = game.wfrp4e?.config?.statusEffects ?? [];
  return config
    .filter(c => c.id !== "dead")
    .map(c => {
      const effect = actor.effects.find(e => e.statuses?.has(c.id) || e.flags?.core?.statusId === c.id);
      // Whether a condition stacks is declared by whoever defined it — the
      // system for the core ten, a module for its own (Chilled, say).
      const numbered = effect?.isNumberedCondition
        ?? c.system?.condition?.numbered
        ?? c.flags?.wfrp4e?.numbered
        ?? (c.flags?.wfrp4e?.value != null)
        ?? false;
      return {
        key: c.id,
        name: loc(c.name ?? c.label) || c.id,
        img: clean(c.img ?? c.icon),
        numbered: !!numbered,
        active: !!effect,
        value: effect ? n(effect.conditionValue ?? effect.flags?.wfrp4e?.value, 1) : 0,
        description: clean(game.wfrp4e?.config?.conditionDescriptions?.[c.id])
      };
    });
}

function experienceLog(actor) {
  return arr(actor.system?.details?.experience?.log)
    .slice(-40)
    .reverse()
    .map(entry => ({
      amount: n(entry.amount),
      reason: clean(entry.reason),
      type: clean(entry.type),
      spent: n(entry.spent),
      total: n(entry.total)
    }));
}

function cleanFields(fields) {
  const out = {};
  if (fields.modifier != null) out.modifier = n(fields.modifier);
  if (fields.successBonus != null) out.successBonus = n(fields.successBonus);
  if (fields.slBonus != null) out.slBonus = n(fields.slBonus);
  if (fields.difficulty) out.difficulty = String(fields.difficulty);
  if (fields.rollMode) out.rollMode = String(fields.rollMode);
  if (fields.hitLocation != null) out.hitLocation = fields.hitLocation;
  if (fields.advantage != null) out.advantage = n(fields.advantage);
  if (fields.attackType) out.attackType = String(fields.attackType);
  return out;
}

function summarise(test) {
  const r = test?.result ?? {};
  return safe({
    messageId: test?.message?.id ?? test?.messageId ?? null,
    roll: r.roll,
    target: r.target,
    SL: r.SL,
    outcome: r.outcome,
    description: r.description,
    damage: r.damage,
    hitloc: r.hitloc?.description ?? r.hitloc?.result ?? null,
    critical: r.critical ?? null,
    fumble: r.fumble ?? null,
    other: r.other ?? []
  });
}

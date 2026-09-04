import { safe, rollModes } from "./generic.js";

/** Order used on the mobile sheet. */
const CHAR_ORDER = ["ws", "bs", "s", "t", "i", "ag", "dex", "int", "wp", "fel"];

const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const arr = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
const loc = k => (k ? game.i18n.localize(k) : "");
/** Some worlds carry the literal string "undefined" in free-text fields. */
const clean = v => (v == null || v === "undefined" ? "" : String(v));

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
      availability: cfg.availability ?? {},
      rollModes: rollModes()
    };
  },

  /* ------------------------------------------------------------------ sheet */

  sheet(actor) {
    const sys = actor.system ?? {};
    const st = sys.status ?? {};
    const det = sys.details ?? {};

    return {
      adapter: "wfrp4e",
      id: actor.id,
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      isOwner: actor.isOwner,

      details: {
        species: det.species?.value ?? "",
        subspecies: det.species?.subspecies ?? "",
        career: det.career?.value ?? "",
        careerLevel: det.careerlevel?.value ?? "",
        class: det.class?.value ?? "",
        statusText: clean(det.status?.value),
        statusTier: det.status?.tier ?? "",
        statusStanding: det.status?.standing ?? "",
        move: {
          value: n(det.move?.value),
          walk: n(det.move?.walk),
          run: n(det.move?.run)
        },
        size: det.size?.value ?? "",
        age: det.age?.value ?? "",
        gender: det.gender?.value ?? "",
        motivation: det.motivation?.value ?? "",
        experience: {
          total: n(det.experience?.total),
          spent: n(det.experience?.spent),
          current: n(det.experience?.total) - n(det.experience?.spent)
        },
        biography: det.biography?.value ?? ""
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
          bonus: n(c.bonus, Math.floor(n(c.value) / 10))
        };
      }),

      status: {
        wounds: { value: n(st.wounds?.value), max: n(st.wounds?.max) },
        advantage: { value: n(st.advantage?.value), max: n(st.advantage?.max, 10) },
        fate: { value: n(st.fate?.value) },
        fortune: { value: n(st.fortune?.value) },
        resilience: { value: n(st.resilience?.value) },
        resolve: { value: n(st.resolve?.value) },
        corruption: { value: n(st.corruption?.value), max: n(st.corruption?.max) },
        sin: { value: n(st.sin?.value) },
        criticalWounds: { value: n(st.criticalWounds?.value), max: n(st.criticalWounds?.max) },
        encumbrance: {
          current: n(st.encumbrance?.current),
          max: n(st.encumbrance?.max),
          pct: n(st.encumbrance?.pct),
          state: n(st.encumbrance?.state)
        },
        armour: armourPoints(actor)
      },

      skills: skills(actor),
      talents: byType(actor, "talent").map(i => ({
        id: i.id, name: i.name, img: i.img,
        advances: n(i.system.advances?.value),
        max: i.system.max?.value ?? "",
        tests: i.system.tests?.value ?? "",
        description: descriptionOf(i)
      })),
      weapons: byType(actor, "weapon").map(weapon),
      armourItems: byType(actor, "armour").map(a => ({
        id: a.id, name: a.name, img: a.img,
        worn: !!a.system.worn?.value,
        type: a.system.armorType?.value ?? "",
        penalty: a.system.penalty?.value ?? "",
        qualities: propertyNames(a, "qualities"),
        flaws: propertyNames(a, "flaws"),
        ap: a.system.currentAP ?? a.system.maxAP ?? {},
        locations: a.system.AP ?? {}
      })),
      spells: byType(actor, "spell").map(s => ({
        id: s.id, name: s.name, img: s.img,
        lore: s.system.lore?.value ?? "",
        cn: n(s.system.cn?.value),
        currentSL: n(s.system.cn?.SL),
        memorized: !!s.system.memorized?.value,
        range: s.system.range?.value ?? "",
        target: s.system.target?.value ?? "",
        duration: s.system.duration?.value ?? "",
        damage: s.system.damage?.value ?? "",
        description: descriptionOf(s)
      })),
      prayers: byType(actor, "prayer").map(p => ({
        id: p.id, name: p.name, img: p.img,
        type: p.system.type?.value ?? "",
        god: p.system.god?.value ?? "",
        range: p.system.range?.value ?? "",
        target: p.system.target?.value ?? "",
        duration: p.system.duration?.value ?? "",
        damage: p.system.damage?.value ?? "",
        description: descriptionOf(p)
      })),
      traits: byType(actor, "trait").map(t => ({
        id: t.id, name: t.name, img: t.img,
        rollable: !!t.system.rollable?.value,
        specification: t.system.specification?.value ?? "",
        description: descriptionOf(t)
      })),
      trappings: [...byType(actor, "trapping"), ...byType(actor, "ammunition"), ...byType(actor, "container")].map(t => ({
        id: t.id, name: t.name, img: t.img, type: t.type,
        quantity: n(t.system.quantity?.value),
        encumbrance: n(t.system.encumbrance?.value),
        trappingType: t.system.trappingType?.value ?? "",
        equipped: !!(t.system.worn?.value ?? t.system.worn),
        description: descriptionOf(t)
      })),
      money: byType(actor, "money").map(m => ({
        id: m.id, name: m.name, img: m.img,
        quantity: n(m.system.quantity?.value),
        coinValue: n(m.system.coinValue?.value)
      })),
      careers: byType(actor, "career").map(c => ({
        id: c.id, name: c.name, img: c.img,
        current: !!c.system.current?.value,
        complete: !!c.system.complete?.value,
        level: c.system.level?.value ?? "",
        status: c.system.status ?? {}
      })),
      ailments: ["critical", "injury", "disease", "psychology", "mutation"].flatMap(type =>
        byType(actor, type).map(i => ({
          id: i.id, name: i.name, img: i.img, kind: type, description: descriptionOf(i)
        }))
      ),
      conditions: conditions(actor),
      extendedTests: byType(actor, "extendedTest").map(e => ({
        id: e.id, name: e.name, img: e.img,
        test: e.system.test?.value ?? "",
        current: n(e.system.SL?.current),
        target: n(e.system.SL?.target)
      }))
    };
  },

  /* ------------------------------------------------------------------- roll */

  async roll(actor, payload) {
    const kind = payload?.kind ?? "characteristic";
    const key = payload?.key;
    const context = {
      skipDialog: payload?.skipDialog !== false,
      fields: cleanFields(payload?.fields ?? {}),
      appendTitle: payload?.appendTitle ?? " — 📱"
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
    const allowed = [
      "system.status.wounds.value",
      "system.status.advantage.value",
      "system.status.fate.value",
      "system.status.fortune.value",
      "system.status.resilience.value",
      "system.status.resolve.value",
      "system.status.corruption.value",
      "system.status.sin.value",
      "system.details.experience.total",
      "system.details.experience.spent"
    ];
    if (!allowed.includes(path)) throw new Error(`Path not allowed: ${path}`);
    await actor.update({ [path]: Number(value) });
    return { path, value: Number(value) };
  }
};

/* -------------------------------------------------------------------------- */

function need(actor, id, type) {
  const item = actor.items.get(id);
  if (!item) throw new Error(`${type} ${id} not found on ${actor.name}`);
  return item;
}

function byType(actor, type) {
  return actor.itemTypes?.[type] ?? actor.items.filter(i => i.type === type);
}

function descriptionOf(item) {
  const raw = item.system?.description?.value ?? "";
  return typeof raw === "string" ? raw : "";
}

function propertyNames(item, key) {
  const props = item.system?.[key];
  const value = props?.value ?? props;
  return arr(value).map(v => (typeof v === "string" ? v : v?.display ?? v?.name ?? v?.value ?? "")).filter(Boolean);
}

function skills(actor) {
  const list = byType(actor, "skill").map(s => ({
    id: s.id,
    name: s.name,
    img: s.img,
    characteristic: s.system.characteristic?.value ?? "",
    characteristicLabel: game.wfrp4e?.config?.characteristicsAbbrev?.[s.system.characteristic?.value] ?? "",
    advances: n(s.system.advances?.value),
    modifier: n(s.system.modifier?.value),
    total: n(s.system.total?.value),
    advanced: (s.system.advanced?.value ?? "bsc") === "adv",
    grouped: s.system.grouped?.value ?? "noSpec"
  })).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

  return {
    basic: list.filter(s => !s.advanced),
    advanced: list.filter(s => s.advanced)
  };
}

function weapon(w) {
  const sys = w.system ?? {};
  return {
    id: w.id,
    name: w.name,
    img: w.img,
    equipped: !!(sys.equipped?.value ?? sys.equipped),
    group: sys.weaponGroup?.value ?? "",
    groupLabel: game.wfrp4e?.config?.weaponGroups?.[sys.weaponGroup?.value] ?? sys.weaponGroup?.value ?? "",
    damage: sys.damage?.value ?? "",
    damageTotal: sys.damage?.dice ? `${sys.damage.value} ${sys.damage.dice}` : (sys.damage?.value ?? ""),
    reach: game.wfrp4e?.config?.weaponReaches?.[sys.reach?.value] ?? sys.reach?.value ?? "",
    range: sys.range?.value ?? "",
    melee: !!sys.isMelee,
    ranged: !!sys.isRanged,
    ammo: sys.currentAmmo?.name ?? "",
    ammoQuantity: n(sys.currentAmmo?.system?.quantity?.value, null),
    loaded: sys.loaded?.value ?? null,
    skill: sys.skillToUse?.name ?? sys.skill?.value ?? "",
    qualities: propertyNames(w, "qualities"),
    flaws: propertyNames(w, "flaws"),
    description: descriptionOf(w)
  };
}

function armourPoints(actor) {
  const src = actor.system?.status?.armour ?? actor.status?.armour ?? {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (value && typeof value === "object") {
      out[key] = { label: value.label ?? key, value: n(value.value), layers: (value.layers ?? []).length };
    }
  }
  return out;
}

function conditions(actor) {
  return actor.effects
    .filter(e => e.statuses?.size || e.flags?.core?.statusId)
    .map(e => ({
      id: e.id,
      name: e.name ?? e.label,
      img: e.img ?? e.icon,
      value: e.conditionValue ?? e.flags?.wfrp4e?.value ?? null,
      disabled: !!e.disabled
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

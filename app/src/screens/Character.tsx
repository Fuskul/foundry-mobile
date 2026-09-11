import React from "react";
import { useStore, bridge } from "../store";
import { useT, Card, Empty, Html, useSwipe, useBackHandler } from "../ui/common";
import { Section, Row, NumEdit, Step, Check, TextEdit, imgUrl, useSheetLabels, Lightbox, Advance, AdvanceEdit } from "../ui/sheet";
import { RollDialog, type RollTarget } from "../ui/RollDialog";

type SheetTab = "main" | "skills" | "talents" | "combat" | "effects" | "magic" | "religion" | "trappings" | "notes";

const ALL_TABS: SheetTab[] = ["main", "skills", "talents", "combat", "effects", "magic", "religion", "trappings", "notes"];

export function Character() {
  const t = useT();
  const s = useStore();
  const [tab, setTab] = React.useState<SheetTab>("main");
  const [target, setTarget] = React.useState<RollTarget | null>(null);

  const sheet = s.sheet;
  const tabs = ALL_TABS.filter(id =>
    (id !== "magic" || sheet?.hasSpells) && (id !== "religion" || sheet?.hasPrayers));
  const active = tabs.includes(tab) ? tab : "main";

  // Back on a non-main sheet tab returns to "main" (the sheet's own home)
  // before the app-level back leaves the screen.
  useBackHandler(active !== "main", () => { setTab("main"); return true; });

  // A sideways flick walks the sheet's own tabs before the app-level tabs see it.
  const stepTab = (delta: number) => {
    const next = tabs[tabs.indexOf(active) + delta];
    if (next) setTab(next);
  };
  const swipe = useSwipe(() => stepTab(1), () => stepTab(-1));

  if (!s.actors.length) {
    if (s.actorsLoading) return <Card title={t("actors.title")}><Empty text={t("app.loading")} /></Card>;
    return (
      <Card title={t("actors.title")}>
        <Empty text={s.bridgeError ? s.bridgeError : t("actors.empty")} />
        <div className="row" style={{ gap: "0.5rem" }}>
          <button className="btn grow" onClick={() => void s.loadActors()}>{t("actors.reload")}</button>
          <button className="btn ghost grow" onClick={() => void s.loadActors("characters")}>{t("actors.showAll")}</button>
        </div>
      </Card>
    );
  }

  const roll = (next: RollTarget) => setTarget(next);

  return (
    <div>
      {s.actors.length > 1 ? (
        s.actors.length > 8 ? (
          <div className="row" style={{ marginBottom: "0.6rem", gap: "0.4rem" }}>
            <select className="grow" value={s.actorId ?? ""} onChange={e => void s.openActor(e.target.value)}>
              {s.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="btn ghost" onClick={() => void s.loadActors(s.actorScope === "mine" ? "characters" : "mine")}>
              {s.actorScope === "mine" ? t("actors.showAll") : t("actors.showMine")}
            </button>
          </div>
        ) : (
          <div className="chips">
            {s.actors.map(a => (
              <button key={a.id} className={`chip ${a.id === s.actorId ? "active" : ""}`} onClick={() => void s.openActor(a.id)}>
                {a.name}
              </button>
            ))}
          </div>
        )
      ) : null}

      {s.sheetStale ? <div className="notice small stale">{t("sheet.stale")}</div> : null}
      {s.sheetError ? <div className="error">{s.sheetError}</div> : null}
      {!sheet ? <p className="muted">{t("app.loading")}</p> : (
        <>
          <div className="chips scrollx tabstrip">
            {tabs.map(id => (
              <button key={id} className={`chip ${active === id ? "active" : ""}`} onClick={() => setTab(id)}>
                {sheet.labels?.[id] || t(`sheet.tab.${id}`)}
              </button>
            ))}
          </div>

          <div className="sheetcols" {...swipe}>

          {active === "main" ? <MainTab sheet={sheet} onRoll={roll} /> : null}
          {active === "skills" ? <SkillsTab sheet={sheet} onRoll={roll} /> : null}
          {active === "talents" ? <TalentsTab sheet={sheet} onRoll={roll} /> : null}
          {active === "combat" ? <CombatTab sheet={sheet} onRoll={roll} /> : null}
          {active === "effects" ? <EffectsTab sheet={sheet} /> : null}
          {active === "magic" ? <MagicTab sheet={sheet} onRoll={roll} /> : null}
          {active === "religion" ? <ReligionTab sheet={sheet} onRoll={roll} /> : null}
          {active === "trappings" ? <TrappingsTab sheet={sheet} /> : null}
          {active === "notes" ? <NotesTab sheet={sheet} /> : null}
          </div>
        </>
      )}

      <RollDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

/* -------------------------------------------------------------------- main */

function MainTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const advance = useStore(s => s.advance);
  const [editing, setEditing] = React.useState(false);
  const [zoom, setZoom] = React.useState<string | null>(null);
  const d = sheet.details ?? {};
  // "Brass 3" already carries the standing in some worlds; never print it twice.
  const statusLine = [d.statusText, /\d/.test(String(d.statusText ?? "")) ? "" : d.statusStanding]
    .filter(Boolean)
    .join(" ")
    .trim();
  const st = sheet.status ?? {};

  return (
    <>
      <Card>
        <div className="row" style={{ marginBottom: "0.6rem" }}>
          {sheet.img ? (
            <img
              src={imgUrl(sheet.img)}
              alt=""
              style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover", cursor: "zoom-in" }}
              onClick={() => setZoom(imgUrl(sheet.img))}
            />
          ) : null}
          <div className="grow">
            <div className="serif" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{sheet.name}</div>
            <div className="small muted">{[d.species, d.subspecies].filter(Boolean).join(" · ")}</div>
            <div className="small muted">{[d.career, d.careerLevel].filter(Boolean).join(" · ")}</div>
            <div className="small muted">{[d.careerClass, d.statusText].filter(Boolean).join(" · ")}</div>
          </div>
          <button className="btn ghost" onClick={() => setEditing(!editing)}>{editing ? t("sheet.done") : t("sheet.edit")}</button>
        </div>

        {editing ? (
          <div className="stack" style={{ gap: "0.35rem" }}>
            <div className="row small muted" style={{ gap: "0.4rem" }}>
              <span style={{ width: "3rem" }} />
              <span style={{ width: 60, textAlign: "center" }}>{L("initial", "sheet.initial")}</span>
              <span style={{ width: 60, textAlign: "center" }}>{L("advances", "sheet.advances")}</span>
              <span style={{ width: 60, textAlign: "center" }}>{L("modifier", "sheet.modifier")}</span>
            </div>
            {sheet.characteristics.map((c: any) => (
              <div key={c.key} className="row" style={{ gap: "0.4rem" }}>
                <b style={{ width: "3rem" }}>{c.abbrev}</b>
                <NumEdit value={c.initial} onCommit={v => void edit(`system.characteristics.${c.key}.initial`, v)} />
                <AdvanceEdit value={c.advances} name={c.label} onAdvance={v => void advance("characteristic", v, c.key)} />
                <NumEdit value={c.modifier} onCommit={v => void edit(`system.characteristics.${c.key}.modifier`, v)} />
                <span className="grow" style={{ textAlign: "right", fontWeight: 700 }}>{c.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="chargrid">
            {sheet.characteristics.map((c: any) => (
              <button
                key={c.key}
                className="charbox"
                onClick={() => onRoll({ actorId: sheet.id, kind: "characteristic", key: c.key, name: c.label, subtitle: `${c.value} (${c.bonus})` })}
              >
                <div className="abbrev">
                  {c.abbrev}
                  {c.inCareer ? (
                    <Advance
                      name={c.label}
                      cost={c.cost}
                      complete={c.complete}
                      onConfirm={() => advance("characteristic", c.advances + 1, c.key)}
                    />
                  ) : null}
                </div>
                <div className="value">{c.value}</div>
                <div className="bonus">{c.bonus}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="resgrid">
          <Resource label={L("wounds", "sheet.wounds")} path="system.status.wounds.value" value={st.wounds?.value ?? 0} max={st.wounds?.max} />
          <Resource label={L("advantage", "sheet.advantage")} path="system.status.advantage.value" value={st.advantage?.value ?? 0} />
          <Resource label={L("fate", "sheet.fate")} path="system.status.fate.value" value={st.fate?.value ?? 0} />
          <Resource label={L("fortune", "sheet.fortune")} path="system.status.fortune.value" value={st.fortune?.value ?? 0} />
          <Resource label={L("resilience", "sheet.resilience")} path="system.status.resilience.value" value={st.resilience?.value ?? 0} />
          <Resource label={L("resolve", "sheet.resolve")} path="system.status.resolve.value" value={st.resolve?.value ?? 0} />
          <Resource label={L("corruption", "sheet.corruption")} path="system.status.corruption.value" value={st.corruption?.value ?? 0} max={st.corruption?.max || undefined} />
          {sheet.hasPrayers ? (
            <Resource label={L("sin", "sheet.sin")} path="system.status.sin.value" value={st.sin?.value ?? 0} />
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="stack small">
          <div className="kv"><span>{L("movement", "sheet.movement")}</span><b>{d.move?.value} / {d.move?.walk} / {d.move?.run}</b></div>
          <div className="kv"><span>{L("encumbrance", "sheet.encumbrance")}</span><b>{st.encumbrance?.current} / {st.encumbrance?.max}</b></div>
          <div className="kv"><span>{L("criticalWounds", "sheet.criticals")}</span><b>{st.criticalWounds?.value} / {st.criticalWounds?.max}</b></div>
          <div className="kv">
            <span>{L("experience", "sheet.exp")}</span>
            {editing ? (
              <span className="row" style={{ gap: "0.3rem" }}>
                <NumEdit value={d.experience?.total ?? 0} width={72} onCommit={v => void edit("system.details.experience.total", v)} />
                <NumEdit value={d.experience?.spent ?? 0} width={72} onCommit={v => void edit("system.details.experience.spent", v)} />
              </span>
            ) : (
              <b>{d.experience?.current} {t("sheet.expFree")} / {d.experience?.total}</b>
            )}
          </div>
          {statusLine ? <div className="kv"><span>{L("status", "sheet.status")}</span><b>{statusLine}</b></div> : null}
        </div>
      </Card>

      <Lightbox src={zoom} onClose={() => setZoom(null)} />

      {sheet.careers?.length ? (
        <Section title={L("careers", "sheet.careers")}>
          {sheet.careers.map((c: any) => (
            <Row
              key={c.id}
              img={c.img}
              name={c.name}
              sub={[c.level, c.careerGroup].filter(Boolean).join(" · ")}
              detail={c}
              right={<span className="small muted">{c.current ? t("sheet.current") : c.complete ? t("sheet.complete") : ""}</span>}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function Resource(props: { label: string; path: string; value: number; max?: number }) {
  const edit = useStore(s => s.edit);
  const [value, setValue] = React.useState(props.value);
  React.useEffect(() => setValue(props.value), [props.value]);

  const change = (delta: number) => {
    const next = Math.max(0, value + delta);
    setValue(next);
    void edit(props.path, next);
  };

  return (
    <div className="res">
      <div className="label">{props.label}</div>
      <div className="ctrl">
        <button onClick={() => change(-1)}>−</button>
        <div className="val grow" style={{ textAlign: "center" }}>
          {value}{props.max != null ? <span className="muted small"> / {props.max}</span> : null}
        </div>
        <button onClick={() => change(1)}>+</button>
      </div>
      {props.max ? <div className="bar"><i style={{ width: `${Math.min(100, (value / props.max) * 100)}%` }} /></div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ skills */

function SkillsTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const advance = useStore(s => s.advance);
  const [query, setQuery] = React.useState("");
  const match = (list: any[]) => list.filter(x => x.name.toLowerCase().includes(query.trim().toLowerCase()));

  const list = (title: string, skills: any[]) => (
    <Section title={title}>
      <div className="skillgrid">
      {skills.length ? skills.map(skill => (
        <Row
          key={skill.id}
          name={skill.name}
          sub={`${skill.characteristicLabel || skill.characteristic.toUpperCase()} · +${skill.advances}`}
          detail={skill}
          onTap={() => onRoll({
            actorId: sheet.id, kind: "skill", key: skill.id, name: skill.name,
            subtitle: `${skill.characteristicLabel || skill.characteristic.toUpperCase()} ${skill.total}`
          })}
          right={
            <>
              {skill.canAdvance ? (
                <Advance
                  name={skill.name}
                  cost={skill.cost}
                  complete={skill.complete}
                  onConfirm={() => advance("skill", skill.advances + 1, undefined, skill.id)}
                />
              ) : null}
              <AdvanceEdit value={skill.advances} width={46} name={skill.name} onAdvance={v => void advance("skill", v, undefined, skill.id)} />
              <span className="num">{skill.total}</span>
            </>
          }
        />
      )) : <Empty text={t("sheet.noSkills")} />}
      </div>
    </Section>
  );

  return (
    <>
      <input placeholder={t("sheet.search")} value={query} onChange={e => setQuery(e.target.value)} style={{ marginBottom: "0.6rem" }} />
      {sheet.extendedTests?.length ? (
        <Section title={L("extendedTests", "sheet.extendedTests")}>
          {sheet.extendedTests.map((x: any) => (
            <Row
              key={x.id}
              name={x.name}
              sub={x.test}
              detail={x}
              onTap={() => onRoll({ actorId: sheet.id, kind: "extended", key: x.id, name: x.name })}
              right={<Step value={`${x.current}/${x.target}`} onStep={d => void edit("system.SL.current", d, x.id, "step")} />}
            />
          ))}
        </Section>
      ) : null}
      {list(L("basicSkills", "sheet.basicSkills"), match(sheet.skills?.basic ?? []))}
      {list(L("advancedSkills", "sheet.advancedSkills"), match(sheet.skills?.advanced ?? []))}
    </>
  );
}

/* ----------------------------------------------------------------- talents */

function TalentsTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const advanceTalent = (itemId: string, _name: string) =>
    useStore.getState().advance("talent", 0, undefined, itemId);
  return (
    <>
      <Section title={L("traits", "sheet.traits")}>
        {(sheet.traits ?? []).length ? sheet.traits.map((x: any) => (
          <Row
            key={x.id}
            img={x.img}
            name={x.name}
            sub={x.specification}
            detail={x}
            onTap={x.rollable ? () => onRoll({ actorId: sheet.id, kind: "trait", key: x.id, name: x.name }) : undefined}
            right={<Check on={!x.disabled} label={t("sheet.equipped")} onToggle={() => void edit("system.disabled", null, x.id, "toggle")} />}
          />
        )) : <Empty text={t("sheet.empty")} />}
      </Section>

      <AspectGroups groups={sheet.aspects?.talents} sheet={sheet} />

      <Section title={L("talents", "sheet.tab.talents")}>
        {(sheet.talents ?? []).length ? sheet.talents.map((x: any) => (
          <Row
            key={x.id}
            img={x.img}
            name={x.name}
            sub={x.tests}
            detail={x}
            right={
              <>
                <span className="num">{x.advances}{x.max ? ` / ${x.max}` : ""}</span>
                {x.canAdvance ? (
                  <Advance name={x.name} cost={x.cost} onConfirm={() => advanceTalent(x.id, x.name)} />
                ) : null}
              </>
            }
          />
        )) : <Empty text={t("sheet.empty")} />}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ combat */

function CombatTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const weapons: any[] = sheet.weapons ?? [];
  const armour = sheet.status?.armour ?? { locations: [] };

  const weaponRow = (w: any) => (
    <Row
      key={w.id}
      img={w.img}
      name={w.name}
      sub={[w.groupLabel, w.damage ? `${t("sheet.damage")} ${w.damage}` : "", w.melee ? w.reach : w.range,
        w.qualities?.length ? w.qualities.join(", ") : ""].filter(Boolean).join(" · ")}
      detail={w}
      onTap={() => onRoll({ actorId: sheet.id, kind: "weapon", key: w.id, name: w.name, actionLabel: t("roll.attack") })}
      right={<Check on={w.equipped} label={t("sheet.equipped")} onToggle={() => void edit("system.equipped.value", null, w.id, "toggle")} />}
    />
  );

  const melee = weapons.filter(w => w.melee && w.equipped);
  const ranged = weapons.filter(w => w.ranged && w.equipped);
  const spare = weapons.filter(w => !w.equipped);

  return (
    <>
      <Card>
        <div className="row spread">
          <b>{L("advantage", "sheet.advantage")}</b>
          <Step value={sheet.status?.advantage?.value ?? 0} onStep={d => void edit("system.status.advantage.value", d, undefined, "step")} />
        </div>
      </Card>

      <Section title={L("meleeWeapons", "sheet.melee")}>
        {melee.length ? melee.map(weaponRow) : <Empty text={t("sheet.empty")} />}
      </Section>

      <Section title={L("rangedWeapons", "sheet.ranged")}>
        {ranged.length ? ranged.map(w => (
          <div key={w.id}>
            {weaponRow(w)}
            {w.ammoList?.length || w.loading ? (
              <div className="row small" style={{ gap: "0.4rem", margin: "-0.2rem 0 0.5rem" }}>
                <span className="muted">{t("sheet.ammo")}</span>
                <select className="grow" value={w.currentAmmo} onChange={e => void edit("system.currentAmmo.value", e.target.value, w.id)}>
                  <option value="">—</option>
                  {(w.ammoList ?? []).map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {w.loading ? (
                  w.loaded.max > 1
                    ? <Step value={`${w.loaded.amt}/${w.loaded.max}`} onStep={d => void edit("system.loaded.amt", d, w.id, "step")} />
                    : <Check on={w.loaded.value} label={t("sheet.loaded")} onToggle={() => void edit("system.loaded.value", null, w.id, "toggle")} />
                ) : null}
              </div>
            ) : null}
          </div>
        )) : <Empty text={t("sheet.empty")} />}
      </Section>

      <Section title={L("armour", "sheet.armour")} right={armour.shield ? <span className="small muted">{t("sheet.shield")} {armour.shield}</span> : undefined}>
        <div className="aplist">
          {(armour.locations ?? []).map((l: any) => (
            <div key={l.key} className="res">
              <div className="label">{l.label}</div>
              <div className="val">{l.value}</div>
            </div>
          ))}
        </div>
        {(sheet.armourItems ?? []).length ? (
          <div style={{ marginTop: "0.6rem" }}>
            {sheet.armourItems.map((a: any) => (
              <Row
                key={a.id}
                img={a.img}
                name={a.name}
                sub={[a.type, a.penalty, ...(a.qualities ?? [])].filter(Boolean).join(" · ")}
                detail={a}
                right={<Check on={a.equipped} label={t("sheet.equipped")} onToggle={() => void edit("system.equipped.value", null, a.id, "toggle")} />}
              />
            ))}
          </div>
        ) : null}
      </Section>

      <Section title={t("sheet.notEquipped")}>
        {spare.length ? spare.map(weaponRow) : <Empty text={t("sheet.empty")} />}
      </Section>

      <AspectGroups groups={sheet.aspects?.combat} sheet={sheet} />
    </>
  );
}

/* ----------------------------------------------------------------- effects */

function EffectsTab({ sheet }: { sheet: any }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const toggleCondition = useStore(s => s.toggleCondition);
  const toggleEffect = useStore(s => s.toggleEffect);
  const edit = useStore(s => s.edit);

  const effectSection = (title: string, list: any[]) => (
    list.length ? (
      <Section title={title}>
        {list.map(e => (
          <Row
            key={e.id}
            img={e.img}
            name={e.name}
            sub={e.source}
            detail={{ description: e.description }}
            right={<Check on={!e.disabled} label={t("sheet.equipped")} onToggle={() => void toggleEffect(e.id, !e.disabled)} />}
          />
        ))}
      </Section>
    ) : null
  );

  const kinds = ["critical", "injury", "disease", "psychology", "mutation"];

  return (
    <>
      <Section title={L("conditions", "sheet.conditions")}>
        <div className="condgrid">
          {(sheet.conditions ?? []).map((c: any) => (
            <div key={c.key} className={`cond ${c.active ? "on" : ""}`}>
              <span className="grow">{c.name}</span>
              {c.numbered
                ? <Step value={c.value} onStep={d => void toggleCondition(c.key, d < 0)} />
                : <Check on={c.active} onToggle={() => void toggleCondition(c.key, c.active)} />}
            </div>
          ))}
        </div>
      </Section>

      {effectSection(t("sheet.temporary"), sheet.effects?.temporary ?? [])}
      {effectSection(t("sheet.passive"), sheet.effects?.passive ?? [])}
      {effectSection(t("sheet.disabledEffects"), sheet.effects?.disabled ?? [])}

      {kinds.map(kind => {
        const list = (sheet.ailments ?? []).filter((a: any) => a.kind === kind);
        if (!list.length) return null;
        return (
          <Section key={kind} title={t(`sheet.kind.${kind}`)}>
            {list.map((a: any) => (
              <Row
                key={a.id}
                img={a.img}
                name={a.name}
                sub={[a.location, a.duration, a.incubation].filter(Boolean).join(" · ")}
                detail={a}
                right={a.kind === "injury" && a.duration
                  ? <Step value={a.duration} onStep={d => void edit("system.duration.value", d, a.id, "step")} />
                  : undefined}
              />
            ))}
          </Section>
        );
      })}

      <AspectGroups groups={sheet.aspects?.effects} sheet={sheet} />
    </>
  );
}

/* ------------------------------------------------------------------- magic */

function MagicTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);

  const spellRow = (x: any, lore: boolean) => (
    <div key={x.id}>
      <Row
        img={x.img}
        name={x.name}
        sub={[lore ? `${t("sheet.cn")} ${x.cn}` : "", x.range, x.target, x.duration, x.damage ? `${t("sheet.damage")} ${x.damage}` : ""]
          .filter(Boolean).join(" · ")}
        detail={x}
        onTap={() => onRoll({ actorId: sheet.id, kind: "cast", key: x.id, name: x.name, actionLabel: t("roll.cast") })}
        right={
          <>
            {lore ? <Check on={x.memorized} label={t("sheet.memorized")} onToggle={() => void edit("system.memorized.value", null, x.id, "toggle")} /> : null}
            <button className="btn ghost" onClick={() => onRoll({ actorId: sheet.id, kind: "channel", key: x.id, name: x.name, actionLabel: t("roll.channel") })}>≈</button>
          </>
        }
      />
      {lore ? (
        <div className="row small" style={{ gap: "0.5rem", margin: "-0.2rem 0 0.5rem" }}>
          <span className="muted">{t("sheet.channelled")}</span>
          <Step value={`${x.channelled}/${x.cn}`} onStep={d => void edit("system.cn.SL", d, x.id, "step")} />
          {x.ingredients?.length ? (
            <select className="grow" value={x.currentIng} onChange={e => void edit("system.currentIng.value", e.target.value, x.id)}>
              <option value="">{t("sheet.ingredient")}: —</option>
              {x.ingredients.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
      {x.lores?.length > 1 ? (
        <div className="chips" style={{ marginTop: "-0.2rem" }}>
          {x.lores.map((l: any) => (
            <button key={l.key} className={`chip ${x.chosenLore === l.key ? "active" : ""}`} onClick={() => void edit("system.lore.chosen", l.key, x.id)}>
              {l.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <Section title={L("pettySpell", "sheet.petty")}>
        {(sheet.spells?.petty ?? []).length ? sheet.spells.petty.map((x: any) => spellRow(x, false)) : <Empty text={t("sheet.empty")} />}
      </Section>
      <Section title={L("loreSpell", "sheet.loreSpells")}>
        {(sheet.spells?.lore ?? []).length ? sheet.spells.lore.map((x: any) => spellRow(x, true)) : <Empty text={t("sheet.empty")} />}
      </Section>
      {(sheet.spells?.cants ?? []).length ? (
        <Section title={L("cants", "sheet.cants")}>
          {sheet.spells.cants.map((x: any) => spellRow(x, false))}
        </Section>
      ) : null}

      <AspectGroups groups={sheet.aspects?.magic} sheet={sheet} />
    </>
  );
}

/* ---------------------------------------------------------------- religion */

function ReligionTab({ sheet, onRoll }: { sheet: any; onRoll: (t: RollTarget) => void }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);

  const prayerRow = (x: any) => (
    <Row
      key={x.id}
      img={x.img}
      name={x.name}
      sub={[x.god, x.range, x.target, x.duration, x.damage ? `${t("sheet.damage")} ${x.damage}` : ""].filter(Boolean).join(" · ")}
      detail={x}
      onTap={() => onRoll({ actorId: sheet.id, kind: "prayer", key: x.id, name: x.name })}
    />
  );

  return (
    <>
      <Card>
        <label className="field">
          <span>{L("blessedBy", "sheet.god")}</span>
          <TextEdit value={sheet.details?.god ?? ""} onCommit={v => void edit("system.details.god.value", v)} />
        </label>
        <div className="row spread">
          <b>{L("sin", "sheet.sin")}</b>
          <Step value={sheet.status?.sin?.value ?? 0} onStep={d => void edit("system.status.sin.value", d, undefined, "step")} />
        </div>
      </Card>

      <Section title={L("blessing", "sheet.blessings")}>
        {(sheet.prayers?.blessing ?? []).length ? sheet.prayers.blessing.map(prayerRow) : <Empty text={t("sheet.empty")} />}
      </Section>
      <Section title={L("miracle", "sheet.miracles")}>
        {(sheet.prayers?.miracle ?? []).length ? sheet.prayers.miracle.map(prayerRow) : <Empty text={t("sheet.empty")} />}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- trappings */

function TrappingsTab({ sheet }: { sheet: any }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const inv = sheet.inventory ?? { categories: [], containers: [], money: { items: [] } };
  const enc = sheet.status?.encumbrance ?? { current: 0, max: 0, state: 0 };
  const stateKey = enc.state > 3 ? 3 : enc.state > 2 ? 2 : enc.state > 1 ? 1 : 0;

  const itemRow = (item: any, toggle: boolean) => (
    <Row
      key={item.id}
      img={item.img}
      name={item.name}
      sub={`${t("sheet.enc")} ${item.encumbrance}`}
      detail={item}
      right={
        <>
          {toggle ? <Check on={item.equipped} label={t("sheet.equipped")} onToggle={() => void edit("system.equipped.value", null, item.id, "toggle")} /> : null}
          <Step value={item.quantity} onStep={d => void edit("system.quantity.value", d, item.id, "step")} />
        </>
      }
    />
  );

  return (
    <>
      <Card>
        <div className="row spread">
          <b>{L("encumbrance", "sheet.encumbrance")}</b>
          <span>{enc.current} / {enc.max}</span>
        </div>
        <div className="bar" style={{ marginTop: "0.3rem" }}>
          <i style={{ width: `${Math.min(100, enc.max ? (enc.current / enc.max) * 100 : 0)}%` }} />
        </div>
        <div className="small muted" style={{ marginTop: "0.25rem" }}>{t(`sheet.enc${stateKey}`)}</div>
      </Card>

      <Section title={L("money", "sheet.money")} right={<span className="small muted">{t("sheet.total")}: {inv.money?.total ?? 0}d</span>}>
        {(inv.money?.items ?? []).length ? inv.money.items.map((m: any) => itemRow(m, false)) : <Empty text={t("sheet.empty")} />}
      </Section>

      {(inv.categories ?? []).map((cat: any) => (
        <Section key={cat.key} title={cat.label}>
          {cat.items.length ? cat.items.map((item: any) => itemRow(item, cat.toggle)) : <Empty text={t("sheet.empty")} />}
        </Section>
      ))}

      {(inv.containers ?? []).length ? (
        <Section title={t("sheet.containers")}>
          {inv.containers.map((c: any) => (
            <div key={c.id}>
              <Row
                img={c.img}
                name={c.name}
                sub={`${c.carries.current} / ${c.carries.max}`}
                right={c.wearable ? <Check on={c.equipped} onToggle={() => void edit("system.equipped.value", null, c.id, "toggle")} /> : undefined}
              />
              <div style={{ paddingLeft: "1rem" }}>
                {c.contents.map((item: any) => itemRow(item, false))}
              </div>
            </div>
          ))}
        </Section>
      ) : null}

      {(sheet.extras ?? []).map((group: any) => (
        <Section key={group.type} title={group.label}>
          {group.items.map((item: any) => (
            <Row
              key={item.id}
              img={item.img}
              name={item.name}
              sub={item.quantity != null ? `${t("sheet.qty")} ${item.quantity}` : undefined}
              detail={item}
              right={item.usable ? <UseButton actorId={sheet.id} itemId={item.id} /> : undefined}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------- notes */

function NotesTab({ sheet }: { sheet: any }) {
  const t = useT();
  const L = useSheetLabels(sheet);
  const edit = useStore(s => s.edit);
  const d = sheet.details ?? {};

  return (
    <>
      <Card>
        <label className="field">
          <span>{L("motivation", "sheet.motivation")}</span>
          <TextEdit value={d.motivation ?? ""} onCommit={v => void edit("system.details.motivation.value", v)} />
        </label>
      </Card>

      <Section title={t("sheet.ambitionsPersonal")}>
        <label className="field">
          <span>{t("sheet.shortTerm")}</span>
          <TextEdit value={d.ambitions?.personalShort ?? ""} onCommit={v => void edit("system.details.personal-ambitions.short-term", v)} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>{t("sheet.longTerm")}</span>
          <TextEdit value={d.ambitions?.personalLong ?? ""} onCommit={v => void edit("system.details.personal-ambitions.long-term", v)} />
        </label>
      </Section>

      <Section title={t("sheet.ambitionsParty")}>
        <label className="field">
          <span>{t("sheet.shortTerm")}</span>
          <TextEdit value={d.ambitions?.partyShort ?? ""} onCommit={v => void edit("system.details.party-ambitions.short-term", v)} />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>{t("sheet.longTerm")}</span>
          <TextEdit value={d.ambitions?.partyLong ?? ""} onCommit={v => void edit("system.details.party-ambitions.long-term", v)} />
        </label>
      </Section>

      {d.biography ? (
        <Section title={L("biography", "sheet.biography")}>
          <div className="detail" style={{ margin: 0, borderRadius: 8, borderTop: "1px solid var(--line)" }}>
            <Html html={d.biography} />
          </div>
        </Section>
      ) : null}

      {sheet.experienceLog?.length ? (
        <Section title={t("sheet.expLog")}>
          {sheet.experienceLog.map((entry: any, index: number) => (
            <div key={index} className="kv">
              <span>{entry.reason}</span>
              <b>{entry.amount > 0 ? `+${entry.amount}` : entry.amount}</b>
            </div>
          ))}
        </Section>
      ) : null}
    </>
  );
}

/** Runs an item's own "use" behaviour, whichever module defined it. */
function UseButton({ actorId, itemId }: { actorId: string; itemId: string }) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      className="btn small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await bridge.useItem(actorId, itemId); }
        catch (err) { useStore.setState({ sheetError: (err as Error).message }); }
        finally { setBusy(false); }
      }}
    >
      {t("sheet.use")}
    </button>
  );
}

/**
 * Sections a module contributes. WFRP4e lets a module say which tab its items
 * belong on and what to call them, so runes, techniques, chanties, cants and
 * anything a third-party compendium adds land in the right place by themselves.
 */
function AspectGroups({ groups, sheet }: { groups?: any[]; sheet: any }) {
  if (!groups?.length) return null;
  return (
    <>
      {groups.map(group => (
        <Section key={`${group.type}-${group.label}`} title={group.label}>
          {group.items.map((item: any) => (
            <Row
              key={item.id}
              img={item.img}
              name={item.name}
              sub={item.note}
              detail={item}
              right={item.usable ? <UseButton actorId={sheet.id} itemId={item.id} /> : undefined}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

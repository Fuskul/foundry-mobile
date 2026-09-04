import React from "react";
import { useStore, bridge } from "../store";
import { useT, Card, Empty, Html } from "../ui/common";
import { RollDialog, type RollTarget } from "../ui/RollDialog";

type SheetTab = "main" | "skills" | "combat" | "talents" | "magic" | "items";

export function Character() {
  const t = useT();
  const s = useStore();
  const [tab, setTab] = React.useState<SheetTab>("main");
  const [target, setTarget] = React.useState<RollTarget | null>(null);

  if (!s.actors.length) {
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

  const sheet = s.sheet;

  return (
    <div>
      {s.actors.length > 1 ? (
        s.actors.length > 8 ? (
          <div className="row" style={{ marginBottom: "0.6rem", gap: "0.4rem" }}>
            <select
              className="grow"
              value={s.actorId ?? ""}
              onChange={event => void s.openActor(event.target.value)}
            >
              {s.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button
              className="btn ghost"
              onClick={() => void s.loadActors(s.actorScope === "mine" ? "characters" : "mine")}
            >
              {s.actorScope === "mine" ? t("actors.showAll") : t("actors.showMine")}
            </button>
          </div>
        ) : (
          <div className="chips">
            {s.actors.map(a => (
              <button
                key={a.id}
                className={`chip ${a.id === s.actorId ? "active" : ""}`}
                onClick={() => void s.openActor(a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
        )
      ) : null}

      {s.sheetError ? <div className="error">{s.sheetError}</div> : null}
      {!sheet ? <p className="muted">{t("app.loading")}</p> : (
        <>
          <div className="chips">
            {(["main", "skills", "combat", "talents", "magic", "items"] as SheetTab[]).map(id => (
              <button key={id} className={`chip ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                {t(`sheet.tab.${id}`)}
              </button>
            ))}
          </div>

          {tab === "main" ? <MainTab sheet={sheet} onRoll={setTarget} /> : null}
          {tab === "skills" ? <SkillsTab sheet={sheet} onRoll={setTarget} /> : null}
          {tab === "combat" ? <CombatTab sheet={sheet} onRoll={setTarget} /> : null}
          {tab === "talents" ? <TalentsTab sheet={sheet} /> : null}
          {tab === "magic" ? <MagicTab sheet={sheet} onRoll={setTarget} /> : null}
          {tab === "items" ? <ItemsTab sheet={sheet} /> : null}
        </>
      )}

      <RollDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------- main */

function MainTab({ sheet, onRoll }: { sheet: any; onRoll: (target: RollTarget) => void }) {
  const t = useT();
  const d = sheet.details ?? {};
  const st = sheet.status ?? {};

  return (
    <>
      <Card>
        <div className="row" style={{ marginBottom: "0.6rem" }}>
          {sheet.img ? <img src={imgUrl(sheet.img)} alt="" style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover" }} /> : null}
          <div className="grow">
            <div className="serif" style={{ fontSize: "1.1rem", fontWeight: 700 }}>{sheet.name}</div>
            <div className="small muted">{[d.species, d.career].filter(Boolean).join(" · ")}</div>
            <div className="small muted">{[d.careerLevel, d.statusText].filter(Boolean).join(" · ")}</div>
          </div>
        </div>

        <div className="chargrid">
          {(sheet.characteristics ?? []).map((c: any) => (
            <button
              key={c.key}
              className="charbox"
              onClick={() => onRoll({ actorId: sheet.id, kind: "characteristic", key: c.key, name: c.label, subtitle: `${c.value} (${c.bonus})` })}
            >
              <div className="abbrev">{c.abbrev}</div>
              <div className="value">{c.value}</div>
              <div className="bonus">{c.bonus}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="resgrid">
          <Resource actorId={sheet.id} label={t("sheet.wounds")} path="system.status.wounds.value" value={st.wounds?.value ?? 0} max={st.wounds?.max} />
          <Resource actorId={sheet.id} label={t("sheet.advantage")} path="system.status.advantage.value" value={st.advantage?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.fate")} path="system.status.fate.value" value={st.fate?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.fortune")} path="system.status.fortune.value" value={st.fortune?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.resilience")} path="system.status.resilience.value" value={st.resilience?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.resolve")} path="system.status.resolve.value" value={st.resolve?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.corruption")} path="system.status.corruption.value" value={st.corruption?.value ?? 0} step={1} />
          <Resource actorId={sheet.id} label={t("sheet.sin")} path="system.status.sin.value" value={st.sin?.value ?? 0} step={1} />
        </div>
      </Card>

      <Card title={t("sheet.armour")}>
        <div className="row wrap">
          {Object.entries(sheet.status?.armour ?? {}).map(([key, ap]: [string, any]) => (
            <div key={key} className="res" style={{ flex: "1 1 30%" }}>
              <div className="label">{ap.label ?? key}</div>
              <div className="val">{ap.value ?? 0}</div>
            </div>
          ))}
          {!Object.keys(sheet.status?.armour ?? {}).length ? <Empty text={t("sheet.empty")} /> : null}
        </div>
      </Card>

      {sheet.conditions?.length ? (
        <Card title={t("sheet.conditions")}>
          {sheet.conditions.map((c: any) => (
            <div key={c.id} className="rowitem">
              {c.img ? <img src={imgUrl(c.img)} alt="" /> : null}
              <span className="name">{c.name}</span>
              {c.value != null ? <span className="num">{c.value}</span> : null}
            </div>
          ))}
        </Card>
      ) : null}

      <Card>
        <div className="stack small">
          <div className="row spread"><span className="muted">{t("sheet.movement")}</span><b>{d.move?.value} / {d.move?.walk} / {d.move?.run}</b></div>
          <div className="row spread"><span className="muted">{t("sheet.encumbrance")}</span><b>{st.encumbrance?.current ?? 0} / {st.encumbrance?.max ?? 0}</b></div>
          <div className="row spread"><span className="muted">{t("sheet.criticals")}</span><b>{st.criticalWounds?.value ?? 0} / {st.criticalWounds?.max ?? 0}</b></div>
          <div className="row spread"><span className="muted">{t("sheet.exp")}</span><b>{d.experience?.current ?? 0} {t("sheet.expFree")} / {d.experience?.total ?? 0}</b></div>
        </div>
      </Card>
    </>
  );
}

function Resource(props: { actorId: string; label: string; path: string; value: number; max?: number; step?: number }) {
  const [value, setValue] = React.useState(props.value);
  React.useEffect(() => setValue(props.value), [props.value]);
  const step = props.step ?? 1;

  const change = async (delta: number) => {
    const next = Math.max(0, value + delta);
    setValue(next);
    try { await bridge.resource(props.actorId, props.path, next); }
    catch { setValue(props.value); }
  };

  return (
    <div className="res">
      <div className="label">{props.label}</div>
      <div className="ctrl">
        <button onClick={() => void change(-step)}>−</button>
        <div className="val grow" style={{ textAlign: "center" }}>
          {value}{props.max != null ? <span className="muted small"> / {props.max}</span> : null}
        </div>
        <button onClick={() => void change(step)}>+</button>
      </div>
      {props.max ? <div className="bar"><i style={{ width: `${Math.min(100, (value / props.max) * 100)}%` }} /></div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- skills */

function SkillsTab({ sheet, onRoll }: { sheet: any; onRoll: (target: RollTarget) => void }) {
  const t = useT();
  const [query, setQuery] = React.useState("");
  const filter = (list: any[]) =>
    list.filter(s => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  const render = (title: string, list: any[]) => (
    <Card title={title}>
      {list.length ? list.map(skill => (
        <button
          key={skill.id}
          className="rowitem"
          onClick={() => onRoll({
            actorId: sheet.id, kind: "skill", key: skill.id, name: skill.name,
            subtitle: `${skill.characteristicLabel || skill.characteristic.toUpperCase()} · ${skill.advances} adv`
          })}
        >
          <span className="name">
            {skill.name}
            <span className="sub">{skill.characteristicLabel || skill.characteristic.toUpperCase()} · +{skill.advances}</span>
          </span>
          <span className="num">{skill.total}</span>
        </button>
      )) : <Empty text={t("sheet.noSkills")} />}
    </Card>
  );

  return (
    <>
      <input
        placeholder="🔍"
        value={query}
        onChange={event => setQuery(event.target.value)}
        style={{ marginBottom: "0.6rem" }}
      />
      {render(t("sheet.basicSkills"), filter(sheet.skills?.basic ?? []))}
      {render(t("sheet.advancedSkills"), filter(sheet.skills?.advanced ?? []))}
    </>
  );
}

/* ----------------------------------------------------------------- combat */

function CombatTab({ sheet, onRoll }: { sheet: any; onRoll: (target: RollTarget) => void }) {
  const t = useT();
  return (
    <>
      <Card title={t("sheet.weapons")}>
        {(sheet.weapons ?? []).length ? sheet.weapons.map((w: any) => (
          <button
            key={w.id}
            className="rowitem"
            onClick={() => onRoll({
              actorId: sheet.id, kind: "weapon", key: w.id, name: w.name,
              subtitle: [w.groupLabel, w.damage ? `${t("sheet.damage")} ${w.damage}` : "", w.reach].filter(Boolean).join(" · "),
              actionLabel: t("roll.attack")
            })}
          >
            {w.img ? <img src={imgUrl(w.img)} alt="" /> : null}
            <span className="name">
              {w.name}
              <span className="sub">
                {[w.groupLabel, w.damage ? `${t("sheet.damage")} ${w.damage}` : "", w.reach || w.range].filter(Boolean).join(" · ")}
                {w.qualities?.length ? ` · ${w.qualities.join(", ")}` : ""}
              </span>
            </span>
            {w.equipped ? <span className="num">⚔</span> : null}
          </button>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>

      <Card title={t("sheet.traits")}>
        {(sheet.traits ?? []).filter((x: any) => x.rollable).length
          ? sheet.traits.filter((x: any) => x.rollable).map((x: any) => (
            <button
              key={x.id}
              className="rowitem"
              onClick={() => onRoll({ actorId: sheet.id, kind: "trait", key: x.id, name: x.name, subtitle: x.specification })}
            >
              <span className="name">{x.name}<span className="sub">{x.specification}</span></span>
            </button>
          ))
          : <Empty text={t("sheet.empty")} />}
      </Card>

      <Card title={t("sheet.armourItems")}>
        {(sheet.armourItems ?? []).length ? sheet.armourItems.map((a: any) => (
          <div key={a.id} className="rowitem">
            {a.img ? <img src={imgUrl(a.img)} alt="" /> : null}
            <span className="name">{a.name}<span className="sub">{[a.type, a.penalty, ...(a.qualities ?? [])].filter(Boolean).join(" · ")}</span></span>
            {a.worn ? <span className="num">🛡</span> : null}
          </div>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>

      {sheet.ailments?.length ? (
        <Card title={t("sheet.ailments")}>
          {sheet.ailments.map((x: any) => (
            <div key={x.id} className="rowitem">
              <span className="name">{x.name}<span className="sub">{x.kind}</span></span>
            </div>
          ))}
        </Card>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- talents */

function TalentsTab({ sheet }: { sheet: any }) {
  const t = useT();
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <Card title={t("sheet.tab.talents")}>
      {(sheet.talents ?? []).length ? sheet.talents.map((x: any) => (
        <div key={x.id}>
          <button className="rowitem" onClick={() => setOpen(open === x.id ? null : x.id)}>
            <span className="name">{x.name}<span className="sub">{x.tests}</span></span>
            <span className="num">{x.advances}</span>
          </button>
          {open === x.id && x.description ? (
            <div className="card small"><Html html={x.description} /></div>
          ) : null}
        </div>
      )) : <Empty text={t("sheet.empty")} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ magic */

function MagicTab({ sheet, onRoll }: { sheet: any; onRoll: (target: RollTarget) => void }) {
  const t = useT();
  return (
    <>
      <Card title={t("sheet.spells")}>
        {(sheet.spells ?? []).length ? sheet.spells.map((x: any) => (
          <div key={x.id} className="row" style={{ gap: "0.3rem", marginBottom: "0.35rem" }}>
            <div className="rowitem grow" style={{ marginBottom: 0 }}>
              <span className="name">{x.name}<span className="sub">{[x.lore, `${t("sheet.cn")} ${x.cn}`, x.range, x.duration].filter(Boolean).join(" · ")}</span></span>
            </div>
            <button className="btn" onClick={() => onRoll({ actorId: sheet.id, kind: "cast", key: x.id, name: x.name, actionLabel: t("roll.cast") })}>✦</button>
            <button className="btn ghost" onClick={() => onRoll({ actorId: sheet.id, kind: "channel", key: x.id, name: x.name, actionLabel: t("roll.channel") })}>≈</button>
          </div>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>

      <Card title={t("sheet.prayers")}>
        {(sheet.prayers ?? []).length ? sheet.prayers.map((x: any) => (
          <button
            key={x.id}
            className="rowitem"
            onClick={() => onRoll({ actorId: sheet.id, kind: "prayer", key: x.id, name: x.name })}
          >
            <span className="name">{x.name}<span className="sub">{[x.god, x.type, x.range].filter(Boolean).join(" · ")}</span></span>
          </button>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ items */

function ItemsTab({ sheet }: { sheet: any }) {
  const t = useT();
  return (
    <>
      <Card title={t("sheet.money")}>
        {(sheet.money ?? []).length ? sheet.money.map((m: any) => (
          <div key={m.id} className="rowitem">
            <span className="name">{m.name}</span>
            <span className="num">{m.quantity}</span>
          </div>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>

      <Card title={t("sheet.trappings")}>
        {(sheet.trappings ?? []).length ? sheet.trappings.map((x: any) => (
          <div key={x.id} className="rowitem">
            {x.img ? <img src={imgUrl(x.img)} alt="" /> : null}
            <span className="name">{x.name}<span className="sub">{t("sheet.enc")} {x.encumbrance}</span></span>
            <span className="num">×{x.quantity}</span>
          </div>
        )) : <Empty text={t("sheet.empty")} />}
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function imgUrl(path: string): string {
  if (!path) return "";
  if (/^(https?:|data:)/i.test(path)) return path;
  const base = useStore.getState().base;
  return `${base}/${path.replace(/^\//, "")}`;
}

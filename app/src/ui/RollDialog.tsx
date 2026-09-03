import React from "react";
import { useT, Modal, Field, Stepper } from "./common";
import { bridge, useStore } from "../store";

export interface RollTarget {
  actorId: string;
  kind: "characteristic" | "skill" | "weapon" | "trait" | "cast" | "channel" | "prayer" | "item";
  key: string;
  name: string;
  subtitle?: string;
  actionLabel?: string;
}

const MOD_PRESETS = [-30, -20, -10, 0, 10, 20, 30];

export function RollDialog({ target, onClose }: { target: RollTarget | null; onClose: () => void }) {
  const t = useT();
  const config = useStore(s => s.systemConfig);
  const [modifier, setModifier] = React.useState(0);
  const [difficulty, setDifficulty] = React.useState("challenging");
  const [slBonus, setSlBonus] = React.useState(0);
  const [successBonus, setSuccessBonus] = React.useState(0);
  const [rollMode, setRollMode] = React.useState("publicroll");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setModifier(0); setSlBonus(0); setSuccessBonus(0);
    setResult(null); setError(null); setBusy(false);
  }, [target?.key, target?.kind]);

  const difficulties: Record<string, string> = config?.difficultyLabels ?? {};
  const rollModes: Record<string, string> = config?.rollModes ?? {
    publicroll: "Public", gmroll: "GM", blindroll: "Blind", selfroll: "Self"
  };

  async function go() {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      const data = await bridge.roll(target.actorId, target.kind, target.key, {
        modifier, difficulty, slBonus, successBonus, rollMode
      });
      if (data?.cancelled) setError(t("roll.cancelled"));
      else setResult(data);
    } catch (err) {
      setError((err as Error).message || t("roll.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose}>
      {target ? (
        <>
          <h2 className="serif">{target.name}</h2>
          {target.subtitle ? <p className="small muted" style={{ margin: "0 0 0.6rem" }}>{target.subtitle}</p> : null}

          {result ? (
            <ResultView result={result} onAgain={() => setResult(null)} onClose={onClose} />
          ) : (
            <>
              {error ? <div className="error">{error}</div> : null}

              <Field label={t("roll.modifier")}>
                <Stepper value={modifier} onChange={setModifier} step={10} />
              </Field>
              <div className="chips">
                {MOD_PRESETS.map(value => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${modifier === value ? "active" : ""}`}
                    onClick={() => setModifier(value)}
                  >
                    {value > 0 ? `+${value}` : value}
                  </button>
                ))}
              </div>

              {Object.keys(difficulties).length ? (
                <Field label={t("roll.difficulty")}>
                  <select value={difficulty} onChange={event => setDifficulty(event.target.value)}>
                    {Object.entries(difficulties).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <div className="row" style={{ gap: "0.6rem" }}>
                <div className="grow">
                  <Field label={t("roll.slBonus")}>
                    <Stepper value={slBonus} onChange={setSlBonus} step={1} />
                  </Field>
                </div>
                <div className="grow">
                  <Field label={t("roll.successBonus")}>
                    <Stepper value={successBonus} onChange={setSuccessBonus} step={1} />
                  </Field>
                </div>
              </div>

              <Field label={t("roll.mode")}>
                <select value={rollMode} onChange={event => setRollMode(event.target.value)}>
                  {Object.entries(rollModes).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </Field>

              <div className="row" style={{ gap: "0.5rem" }}>
                <button className="btn ghost grow" onClick={onClose}>{t("common.close")}</button>
                <button className="btn primary grow" disabled={busy} onClick={go}>
                  {busy ? t("roll.rolling") : (target.actionLabel ?? t("roll.go"))}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}
    </Modal>
  );
}

function ResultView({ result, onAgain, onClose }: { result: any; onAgain: () => void; onClose: () => void }) {
  const t = useT();
  const sl = Number(result?.SL);
  const success = Number.isFinite(sl) ? sl >= 0 : undefined;
  return (
    <div className="stack">
      <div className="resgrid">
        <div className="res">
          <div className="label">{t("roll.result")}</div>
          <div className="val">{result?.roll ?? "—"}</div>
        </div>
        <div className="res">
          <div className="label">{t("roll.target")}</div>
          <div className="val">{result?.target ?? "—"}</div>
        </div>
      </div>
      <div className="res" style={{ borderColor: success === undefined ? undefined : success ? "#5c8a4a" : "#8f2f26" }}>
        <div className="label">{t("roll.sl")}</div>
        <div className="val">{Number.isFinite(sl) ? (sl > 0 ? `+${sl}` : sl) : "—"}</div>
      </div>
      {result?.description ? <p className="small" style={{ margin: 0 }}>{result.description}</p> : null}
      {result?.hitloc ? <p className="small muted" style={{ margin: 0 }}>{result.hitloc}</p> : null}
      {result?.damage != null ? <p className="small" style={{ margin: 0 }}>{t("sheet.damage")}: <b>{String(result.damage)}</b></p> : null}
      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn ghost grow" onClick={onAgain}>{t("common.retry")}</button>
        <button className="btn grow" onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}

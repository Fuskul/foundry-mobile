import React from "react";
import { useT, Card } from "./common";
import { useStore, conn } from "../store";
import { runSelfTest, formatSteps, emptySteps, type Step } from "../foundry/selftest";

const COLOR: Record<string, string> = {
  ok: "var(--green)",
  fail: "var(--blood)",
  running: "var(--gold)",
  skip: "var(--ink-dim)",
  pending: "var(--ink-dim)"
};

const GLYPH: Record<string, string> = {
  ok: "✓", fail: "✕", running: "…", skip: "–", pending: "·"
};

export function Diagnostics() {
  const t = useT();
  const s = useStore();
  const [steps, setSteps] = React.useState<Step[]>(emptySteps());
  const [running, setRunning] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function run() {
    setRunning(true);
    setSteps(emptySteps());
    try { await runSelfTest(s.base, s.username, s.password, setSteps); }
    finally { setRunning(false); }
  }

  async function copy() {
    const header = `Foundry Mobile self-test\n${s.base}\n`;
    const log = conn.logs.slice(-60).map(l => `${new Date(l.at).toLocaleTimeString()} [${l.level}] ${l.text}`).join("\n");
    const text = `${header}\n${formatSteps(steps, id => t(`diag.${id}`))}\n\n--- log ---\n${log}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable */ }
  }

  return (
    <Card title={t("diag.title")}>
      <p className="small muted" style={{ marginTop: 0 }}>{t("diag.hint")}</p>

      <div className="stack" style={{ gap: "0.3rem", marginBottom: "0.7rem" }}>
        {steps.map(step => (
          <div key={step.id} className="row small" style={{ alignItems: "flex-start", gap: "0.45rem" }}>
            <span style={{ color: COLOR[step.state], fontWeight: 700, width: "1rem", flex: "0 0 auto" }}>
              {GLYPH[step.state]}
            </span>
            <span className="grow" style={{ whiteSpace: "normal" }}>
              {t(`diag.${step.id}`)}
              {step.detail ? <span className="muted"> — {step.detail}</span> : null}
            </span>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: "0.5rem" }}>
        <button className="btn primary grow" disabled={running || !s.base} onClick={() => void run()}>
          {running ? t("diag.running") : t("diag.run")}
        </button>
        <button className="btn grow" onClick={() => void copy()}>
          {copied ? t("settings.copied") : t("diag.copy")}
        </button>
      </div>
    </Card>
  );
}

import React from "react";
import { useStore, conn } from "../store";
import { useT, Card } from "../ui/common";
import { LANGS } from "../i18n";
import { Diagnostics } from "../ui/Diagnostics";

export function Settings() {
  const t = useT();
  const s = useStore();
  const [copied, setCopied] = React.useState(false);

  const logText = conn.logs
    .map(l => `${new Date(l.at).toLocaleTimeString()} [${l.level}] ${l.text}`)
    .join("\n");

  async function copyLogs() {
    try { await navigator.clipboard.writeText(logText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable */ }
  }

  return (
    <div>
      <Card title={t("settings.language")}>
        <select value={s.lang} onChange={event => s.setLang(event.target.value as any)}>
          {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </Card>

      <Card title={t("settings.connection")}>
        <div className="small stack" style={{ gap: "0.2rem" }}>
          <div className="row spread"><span className="muted">{t("connect.server")}</span><b>{s.base}</b></div>
          <div className="row spread"><span className="muted">{t("connect.world")}</span><b>{s.status.world ?? "—"}</b></div>
          <div className="row spread">
            <span className="muted">{t("settings.connection")}</span>
            <b style={{ color: s.connected ? "var(--green)" : "var(--blood)" }}>
              {s.connected ? t("status.connected") : t("status.offline")}
            </b>
          </div>
        </div>
        <div className="row" style={{ marginTop: "0.7rem", gap: "0.5rem" }}>
          <button className="btn grow" onClick={() => void s.checkBridge()}>{t("settings.recheck")}</button>
          <button className="btn ghost grow" onClick={() => void s.logout()}>{t("settings.logout")}</button>
        </div>
      </Card>

      <Card title={t("settings.bridge")}>
        {s.bridgeInfo ? (
          <div className="small stack" style={{ gap: "0.2rem" }}>
            <div className="notice">{t("settings.bridgeOk", { name: s.bridgeInfo.executor?.name ?? "?" })}</div>
            <div className="row spread"><span className="muted">Foundry</span><b>{s.bridgeInfo.foundry}</b></div>
            <div className="row spread"><span className="muted">{t("connect.system")}</span><b>{s.bridgeInfo.system?.id} {s.bridgeInfo.system?.version}</b></div>
            <div className="row spread"><span className="muted">Adapter</span><b>{s.bridgeInfo.adapter}</b></div>
            <div className="row spread"><span className="muted">Module</span><b>{s.bridgeInfo.module}</b></div>
          </div>
        ) : (
          <div className="error">{t("settings.bridgeMissing")}{s.bridgeError ? ` (${s.bridgeError})` : ""}</div>
        )}
      </Card>

      <Diagnostics />

      <Card title={t("settings.logs")}>
        <pre className="log">{logText || "—"}</pre>
        <button className="btn block" style={{ marginTop: "0.5rem" }} onClick={() => void copyLogs()}>
          {copied ? t("settings.copied") : t("settings.copyLogs")}
        </button>
      </Card>

      <Card title={t("settings.about")}>
        <p className="small muted" style={{ margin: 0 }}>
          Foundry Mobile 0.1.0 — companion app for Foundry VTT (WFRP 4e).
        </p>
      </Card>
    </div>
  );
}

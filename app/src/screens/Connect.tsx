import React from "react";
import { useStore, type ServerEntry } from "../store";
import { useT, Field, Card, Modal, ThemeToggle, LangToggle } from "../ui/common";
import { translateError } from "../i18n";
import { Diagnostics } from "../ui/Diagnostics";

export function Connect() {
  const t = useT();
  const s = useStore();
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState<ServerEntry | null>(null);
  const [address, setAddress] = React.useState("");
  const [label, setLabel] = React.useState("");

  const openAdd = () => { setAddress(s.base || ""); setLabel(""); setAdding(true); };

  function confirmAdd() {
    if (!address.trim()) return;
    s.addServer(address, label);
    setAdding(false);
    void s.probe(address);
  }

  function confirmRename() {
    if (renaming) s.renameServer(renaming.url, label);
    setRenaming(null);
  }

  return (
    <div>
      <Card>
        <div className="row spread" style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ margin: 0 }}>{t("connect.title")}</h2>
          <div className="row" style={{ gap: "0.4rem" }}>
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>

        <div className="row spread" style={{ marginBottom: "0.4rem" }}>
          <span className="small muted">{t("connect.saved")}</span>
          <button className="linkbtn small" onClick={() => void s.checkServers()}>
            {t("connect.refresh")}
          </button>
        </div>

        <div className="serverlist">
          {s.servers.map(entry => {
            const info = s.serverStatus[entry.url] ?? {};
            const parts = [
              info.world,
              [info.system, info.systemVersion].filter(Boolean).join(" "),
              info.version ? `Foundry ${info.version}` : ""
            ].filter(Boolean);
            return (
              <div key={entry.url} className={`server ${entry.url === s.base ? "active" : ""}`}>
                <button className="server-main" onClick={() => void s.probe(entry.url)}>
                  <span className="server-head">
                    <span
                      className={`dot ${info.checking ? "wait" : info.online ? "on" : ""}`}
                      aria-hidden="true"
                    />
                    <b>{entry.name}</b>
                  </span>
                  <span className="server-url">{entry.url.replace(/^https?:\/\//, "")}</span>
                  <span className="server-meta small muted">
                    {info.checking
                      ? t("connect.checking")
                      : info.online
                        ? parts.join(" · ") || t("connect.stateOnline")
                        : t("connect.stateOffline")}
                    {info.online && typeof info.players === "number"
                      ? ` · ${t("connect.online")}: ${info.players}`
                      : ""}
                  </span>
                </button>
                <div className="server-tools">
                  <button
                    className="iconbtn"
                    aria-label={t("connect.rename")}
                    onClick={() => { setRenaming(entry); setLabel(entry.name); }}
                  >
                    ✎
                  </button>
                  <button
                    className="iconbtn"
                    aria-label={t("connect.forget")}
                    onClick={() => s.forgetServer(entry.url)}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}

          <button className="server add" onClick={openAdd}>
            <span>＋ {t("connect.addServer")}</span>
          </button>
        </div>

        {s.error ? <div className="error" style={{ marginTop: "0.7rem" }}>{translateError(s.lang, s.error)}</div> : null}

        {s.busy === "probe" ? (
          <div className="notice small" style={{ marginTop: "0.7rem", marginBottom: 0 }}>{t("connect.checking")}</div>
        ) : null}

        {s.probed && s.status.version ? (
          <div className="notice small" style={{ marginTop: "0.7rem", marginBottom: 0 }}>
            {[
              s.worldTitle || s.status.world,
              `${s.status.system ?? ""} ${s.status.systemVersion ?? ""}`.trim(),
              `Foundry ${s.status.version}`
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        ) : null}
      </Card>

      {s.probed ? (
        <Card>
          <Field label={t("connect.user")}>
            {s.users.length ? (
              <select value={s.userId} onChange={event => s.setField("userId", event.target.value)}>
                <option value="">{t("connect.selectUser")}</option>
                {s.users.map(u => {
                  const busy = s.activeUsers.includes(u.id);
                  return (
                    <option key={u.id} value={u.id} disabled={busy}>
                      {u.name}{busy ? ` — ${t("connect.inGame")}` : ""}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="error" style={{ margin: 0 }}>
                {t("connect.noUsers")}
                {s.usersError ? <div className="small" style={{ marginTop: "0.3rem", opacity: 0.85 }}>{s.usersError}</div> : null}
              </div>
            )}
          </Field>

          <Field label={t("connect.password")} hint={t("connect.passwordHint")}>
            <input
              type="password"
              value={s.password}
              onChange={event => s.setField("password", event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && s.userId) void s.login(); }}
            />
          </Field>

          <label className="row small" style={{ marginBottom: "0.7rem" }}>
            <input
              type="checkbox"
              style={{ width: "auto" }}
              checked={s.remember}
              onChange={event => s.setField("remember", event.target.checked)}
            />
            <span>{t("connect.remember")}</span>
          </label>

          {s.userId && s.activeUsers.includes(s.userId) ? (
            <div className="notice small" style={{ marginTop: 0, marginBottom: "0.6rem" }}>{t("connect.inGameHint")}</div>
          ) : null}
          <button
            className="btn primary block"
            disabled={!s.userId || s.busy === "login" || s.activeUsers.includes(s.userId)}
            onClick={() => void s.login()}
          >
            {s.busy === "login" ? t("connect.loggingIn") : t("connect.login")}
          </button>

          <div className="hr-or"><span>{t("connect.or")}</span></div>

          <button
            className="btn block"
            onClick={() => { window.location.href = `${s.base.replace(/\/$/, "")}/game?fvttmobile=1`; }}
          >
            {t("connect.noGm")}
          </button>
          <div className="small muted" style={{ marginTop: "0.3rem" }}>{t("connect.noGmHint")}</div>
        </Card>
      ) : null}

      <Diagnostics />

      <Modal open={adding} title={t("connect.addServer")} onClose={() => setAdding(false)}>
        <Field label={t("connect.server")} hint={t("connect.serverHint")}>
          <input
            value={address}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="192.168.1.103:30000"
            onChange={event => setAddress(event.target.value)}
          />
        </Field>
        <Field label={t("connect.name")} hint={t("connect.nameHint")}>
          <input
            value={label}
            placeholder={t("connect.namePlaceholder")}
            onChange={event => setLabel(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") confirmAdd(); }}
          />
        </Field>
        <button className="btn primary block" disabled={!address.trim()} onClick={confirmAdd}>
          {t("connect.save")}
        </button>
      </Modal>

      <Modal open={!!renaming} title={t("connect.rename")} onClose={() => setRenaming(null)}>
        <Field label={t("connect.name")}>
          <input
            value={label}
            autoFocus
            onChange={event => setLabel(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") confirmRename(); }}
          />
        </Field>
        <button className="btn primary block" onClick={confirmRename}>{t("connect.save")}</button>
      </Modal>
    </div>
  );
}

import React from "react";
import { useStore } from "../store";
import { useT, Field, Card } from "../ui/common";
import { LANGS, translateError } from "../i18n";
import { Diagnostics } from "../ui/Diagnostics";

export function Connect() {
  const t = useT();
  const s = useStore();
  const [base, setBase] = React.useState(s.base);

  React.useEffect(() => setBase(s.base), [s.base]);

  const check = (address: string) => {
    setBase(address);
    void s.probe(address);
  };

  return (
    <div>
      <Card>
        <div className="row spread" style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ margin: 0 }}>{t("connect.title")}</h2>
          <select
            style={{ width: "auto" }}
            value={s.lang}
            onChange={event => s.setLang(event.target.value as any)}
          >
            {LANGS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>

        {s.servers.length ? (
          <>
            <span className="small muted">{t("connect.saved")}</span>
            <div className="chips" style={{ marginTop: "0.3rem" }}>
              {s.servers.map(address => (
                <span key={address} className={`chip ${address === s.base ? "active" : ""}`} style={{ paddingRight: "0.35rem" }}>
                  <button
                    className="chip-label"
                    onClick={() => check(address)}
                    title={address}
                  >
                    {address.replace(/^https?:\/\//, "")}
                  </button>
                  <button
                    className="chip-x"
                    aria-label={t("connect.forget")}
                    onClick={() => s.forgetServer(address)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        ) : null}

        {s.error ? <div className="error">{translateError(s.lang, s.error)}</div> : null}

        <Field label={t("connect.server")} hint={t("connect.serverHint")}>
          <input
            value={base}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="192.168.1.103:30000"
            onChange={event => setBase(event.target.value)}
          />
        </Field>

        <button
          className="btn block"
          disabled={s.busy === "probe" || !base.trim()}
          onClick={() => check(base)}
        >
          {s.busy === "probe" ? t("connect.checking") : t("connect.check")}
        </button>

        {s.probed && s.status.version ? (
          <div className="notice small" style={{ marginTop: "0.7rem", marginBottom: 0 }}>
            {[s.status.world, `${s.status.system ?? ""} ${s.status.systemVersion ?? ""}`.trim(), `Foundry ${s.status.version}`]
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
                {s.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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

          <button
            className="btn primary block"
            disabled={!s.userId || s.busy === "login"}
            onClick={() => void s.login()}
          >
            {s.busy === "login" ? t("connect.loggingIn") : t("connect.login")}
          </button>
        </Card>
      ) : null}

      <Diagnostics />
    </div>
  );
}

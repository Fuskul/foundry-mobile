import React from "react";
import { useStore } from "../store";
import { useT, Field, Card } from "../ui/common";
import { LANGS } from "../i18n";
import { Diagnostics } from "../ui/Diagnostics";

export function Connect() {
  const t = useT();
  const s = useStore();
  const [base, setBase] = React.useState(s.base);

  React.useEffect(() => setBase(s.base), [s.base]);

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

        {s.error ? <div className="error">{s.error}</div> : null}

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
          onClick={() => void s.probe(base)}
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
          <Field label={t("connect.user")} hint={t("connect.userHint")}>
            <input
              value={s.username}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t("connect.userPlaceholder")}
              onChange={event => s.setField("username", event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && s.username) void s.login(); }}
            />
          </Field>

          <Field label={t("connect.password")} hint={t("connect.passwordHint")}>
            <input
              type="password"
              value={s.password}
              onChange={event => s.setField("password", event.target.value)}
              onKeyDown={event => { if (event.key === "Enter" && s.username) void s.login(); }}
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
            disabled={!s.username.trim() || s.busy === "login"}
            onClick={() => void s.login()}
          >
            {s.busy === "login" ? t("connect.loggingIn") : t("connect.login")}
          </button>
        </Card>
      ) : null}

      {s.error ? <Diagnostics /> : null}
    </div>
  );
}

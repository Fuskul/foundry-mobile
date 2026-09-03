import React from "react";
import { useStore } from "../store";
import { useT, Field, Card } from "../ui/common";
import { LANGS } from "../i18n";

export function Connect() {
  const t = useT();
  const s = useStore();
  const [base, setBase] = React.useState(s.base);

  React.useEffect(() => setBase(s.base), [s.base]);

  const probed = s.users.length > 0;

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
            placeholder="192.168.1.50:30000"
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
      </Card>

      {probed ? (
        <Card>
          <div className="small muted stack" style={{ gap: "0.15rem", marginBottom: "0.7rem" }}>
            {s.status.world ? <div>{t("connect.world")}: <b>{s.status.world}</b></div> : null}
            {s.status.system ? <div>{t("connect.system")}: <b>{s.status.system} {s.status.systemVersion ?? ""}</b></div> : null}
            {s.status.version ? <div>{t("connect.version")}: <b>{s.status.version}</b></div> : null}
            {s.status.activeUsers != null ? <div>{t("connect.online")}: <b>{s.status.activeUsers}</b></div> : null}
          </div>

          <Field label={t("connect.user")}>
            <select value={s.userId} onChange={event => s.setField("userId", event.target.value)}>
              <option value="">{t("connect.selectUser")}</option>
              {s.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>

          <Field label={t("connect.password")} hint={t("connect.passwordHint")}>
            <input
              type="password"
              value={s.password}
              onChange={event => s.setField("password", event.target.value)}
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

      {s.users.length === 0 && s.status.version ? <div className="error">{t("connect.noUsers")}</div> : null}
    </div>
  );
}

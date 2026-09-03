import React from "react";
import { useStore, bridge } from "../store";
import { useT, Card, Empty } from "../ui/common";
import { RollDialog, type RollTarget } from "../ui/RollDialog";

export function Dice() {
  const t = useT();
  const s = useStore();
  const [target, setTarget] = React.useState<RollTarget | null>(null);
  const [formula, setFormula] = React.useState("1d100");
  const [sending, setSending] = React.useState(false);

  const sheet = s.sheet;

  async function sendFormula() {
    setSending(true);
    try { await bridge.chat(`/roll ${formula}`, s.actorId ?? undefined); }
    finally { setSending(false); }
  }

  return (
    <div>
      <Card title={t("dice.characteristics")}>
        {sheet?.characteristics?.length ? (
          <div className="chargrid">
            {sheet.characteristics.map((c: any) => (
              <button
                key={c.key}
                className="charbox"
                onClick={() => setTarget({ actorId: sheet.id, kind: "characteristic", key: c.key, name: c.label })}
              >
                <div className="abbrev">{c.abbrev}</div>
                <div className="value">{c.value}</div>
              </button>
            ))}
          </div>
        ) : <Empty text={t("actors.empty")} />}
      </Card>

      <Card title={t("dice.formula")}>
        <div className="row">
          <input
            className="grow"
            value={formula}
            onChange={event => setFormula(event.target.value)}
            placeholder={t("dice.formulaHint")}
            autoCapitalize="none"
            spellCheck={false}
          />
          <button className="btn primary" disabled={sending || !formula.trim()} onClick={() => void sendFormula()}>
            {t("dice.send")}
          </button>
        </div>
        <div className="chips" style={{ marginTop: "0.6rem" }}>
          {["1d100", "1d10", "2d10", "1d6", "3d6", "1d100+10"].map(f => (
            <button key={f} className={`chip ${formula === f ? "active" : ""}`} onClick={() => setFormula(f)}>{f}</button>
          ))}
        </div>
      </Card>

      <RollDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

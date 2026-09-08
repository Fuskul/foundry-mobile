import React from "react";
import { useStore } from "../store";
import { useT, Modal } from "../ui/common";
import { imgUrl } from "../ui/sheet";

/**
 * A slim bar that appears under the title while an encounter is running: whose
 * turn it is, your-turn highlight, and a tap to open the full tracker.
 */
export function CombatBar() {
  const t = useT();
  const combat = useStore(s => s.combat);
  const [open, setOpen] = React.useState(false);
  if (!combat) return null;

  const current = combat.combatants?.find((c: any) => c.id === combat.currentId);

  return (
    <>
      <button className={`combatbar ${combat.yourTurn ? "your-turn" : ""}`} onClick={() => setOpen(true)}>
        <span className="round">{t("combat.round")} {combat.round}</span>
        <span className="cur">
          {combat.yourTurn ? `▶ ${t("combat.yourTurn")}` : (current ? current.name : t("combat.notStarted"))}
        </span>
        <span className="chev">⤢</span>
      </button>
      <CombatTracker open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CombatTracker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const combat = useStore(s => s.combat);
  const targetId = useStore(s => s.targetId);
  const setTarget = useStore(s => s.setTarget);
  const act = useStore(s => s.combatAction);
  if (!combat) return null;

  const mineNeedInit = combat.combatants?.some((c: any) => c.mine && c.initiative == null);

  return (
    <Modal open={open} title={`${t("combat.title")} — ${t("combat.round")} ${combat.round}`} onClose={onClose}>
      <div className="tracklist">
        {combat.combatants?.map((c: any) => (
          <div
            key={c.id}
            className={`track ${c.active ? "active" : ""} ${c.id === targetId ? "targeted" : ""} ${c.defeated ? "defeated" : ""}`}
          >
            <span className="init">{c.initiative ?? "—"}</span>
            {c.img ? <img src={imgUrl(c.img)} alt="" /> : <span className="noimg" />}
            <span className="who">
              {c.name}
              {c.wounds ? <span className="small muted"> {c.wounds.value}/{c.wounds.max}</span> : null}
            </span>
            {!c.mine ? (
              <button
                className={`btn small ${c.id === targetId ? "primary" : "ghost"}`}
                onClick={() => setTarget(c.id)}
              >
                {c.id === targetId ? t("combat.targeted") : t("combat.aim")}
              </button>
            ) : (
              <span className="pill">{t("combat.you")}</span>
            )}
          </div>
        ))}
      </div>

      {mineNeedInit ? (
        <button className="btn primary block" style={{ marginTop: "0.6rem" }} onClick={() => void act("rollInitiative")}>
          {t("combat.rollInit")}
        </button>
      ) : null}

      {combat.isGM ? (
        <div className="row" style={{ gap: "0.4rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn ghost grow" onClick={() => void act("previous")}>◀ {t("combat.prev")}</button>
          <button className="btn ghost grow" onClick={() => void act("next")}>{t("combat.next")} ▶</button>
          <button className="btn ghost grow" onClick={() => void act("nextRound")}>{t("combat.nextRound")}</button>
          <button className="btn ghost grow" onClick={() => void act("end")}>{t("combat.end")}</button>
        </div>
      ) : null}

      {targetId ? (
        <p className="small muted" style={{ marginTop: "0.6rem", marginBottom: 0 }}>{t("combat.targetHint")}</p>
      ) : null}
    </Modal>
  );
}

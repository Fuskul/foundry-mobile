import React from "react";
import { useStore, conn, bridge } from "../store";
import { useT, Html, Empty, useBackHandler } from "../ui/common";

const PRESETS = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100"];
const MODES = ["publicroll", "gmroll", "blindroll", "selfroll"] as const;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i;

interface OpposedInfo {
  defender: { id: string; name: string };
  canAct: boolean;
  options: { id: string; label: string; icon?: string }[];
}

export function Chat() {
  const t = useT();
  const s = useStore();
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [dice, setDice] = React.useState(false);
  const [formula, setFormula] = React.useState("1d100");
  const [mode, setMode] = React.useState<string>("publicroll");
  const [zoom, setZoom] = React.useState<string | null>(null);
  useBackHandler(!!zoom, () => { setZoom(null); return true; });
  const [opposed, setOpposed] = React.useState<Record<string, OpposedInfo | null>>({});
  const endRef = React.useRef<HTMLDivElement>(null);

  const visible = React.useMemo(
    () => s.chat.filter(m => !m.whisper?.length || m.whisper.includes(conn.userId)),
    [s.chat]
  );

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [visible.length]);

  // Opposed cards arrive as bare icons; the module says what each button means.
  React.useEffect(() => {
    const wanted = visible.filter(m => /clickOpposedResponse/.test(m.content) && !(m.id in opposed));
    if (!wanted.length) return;
    let cancelled = false;
    void (async () => {
      for (const message of wanted.slice(-4)) {
        let info: OpposedInfo | null = null;
        try { info = (await bridge.messageActions(message.id))?.opposed ?? null; }
        catch { info = null; }
        if (cancelled) return;
        setOpposed(prev => ({ ...prev, [message.id]: info }));
      }
    })();
    return () => { cancelled = true; };
  }, [visible, opposed]);

  const modeLabel = (key: string) =>
    s.systemConfig?.rollModes?.[key] ?? t(`roll.mode.${key}`);

  async function onCardClick(event: React.MouseEvent<HTMLDivElement>, messageId: string) {
    const target = event.target as HTMLElement;

    if (target.tagName === "IMG") {
      const src = (target as HTMLImageElement).src;
      if (src) { event.preventDefault(); setZoom(src); return; }
    }

    // Links keep their address in data-href, so a tap never navigates the app away.
    const link = target.closest("[data-href]") as HTMLElement | null;
    if (link) {
      event.preventDefault();
      const href = link.dataset.href!;
      if (IMAGE.test(href)) setZoom(href);
      else window.open(href, "_blank");
      return;
    }

    const el = target.closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    event.preventDefault();
    const action = el.dataset.action!;
    // An opposed answer is rolled by this player, not pressed on the host's screen.
    if (action === "clickOpposedResponse") {
      await answerOpposed(messageId, el.dataset.itemId ?? "");
      return;
    }
    const siblings = [...(event.currentTarget.querySelectorAll(`[data-action="${action}"]`))];
    const index = Math.max(0, siblings.indexOf(el));
    el.setAttribute("disabled", "true");
    try { await bridge.cardAction(messageId, action, index); }
    catch (err) { conn.log("warn", `card action "${action}" failed: ${(err as Error).message}`); }
    finally { el.removeAttribute("disabled"); }
  }

  async function answerOpposed(messageId: string, optionId: string) {
    const info = opposed[messageId];
    const actorId = info?.defender?.id ?? s.actorId;
    if (!actorId || !optionId) return;
    setSending(true);
    try { await bridge.opposed(actorId, messageId, optionId); }
    catch (err) { conn.log("warn", `opposed answer failed: ${(err as Error).message}`); }
    finally { setSending(false); }
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try { await s.sendChat(text); setText(""); }
    finally { setSending(false); }
  }

  async function rollFormula() {
    if (!formula.trim()) return;
    setSending(true);
    const command = mode === "publicroll" ? "/r" : `/${mode}`;
    try { await bridge.chat(`${command} ${formula.trim()}`, s.actorId ?? undefined, mode); }
    catch (err) { conn.log("warn", `roll failed: ${(err as Error).message}`); }
    finally { setSending(false); }
  }

  return (
    <div>
      <div className="chatlist">
        {visible.length ? visible.map(m => {
          const info = opposed[m.id];
          return (
            <div key={m.id} className="msg">
              <div className="who">
                <span className="when">{new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                {m.alias}
              </div>
              {m.flavor ? <div className="small muted">{m.flavor.replace(/<[^>]*>/g, "")}</div> : null}
              <div
                className={info?.options?.length ? "hide-opposed" : undefined}
                onClick={event => void onCardClick(event, m.id)}
              >
                <Html html={m.content} />
              </div>

              {info?.options?.length ? (
                <div className="cardactions">
                  <div className="small muted">{t("chat.opposed", { name: info.defender.name })}</div>
                  <div className="row wrap" style={{ gap: "0.35rem", marginTop: "0.3rem" }}>
                    {info.options.map(option => (
                      <button
                        key={option.id}
                        className="btn small"
                        disabled={!info.canAct || sending}
                        onClick={() => void answerOpposed(m.id, option.id)}
                      >
                        {option.id === "unopposed" ? t("chat.unopposed") : option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {m.rolls.length && !/dice-total|chat-card/.test(m.content) ? (
                <div className="rolls">
                  {m.rolls.map((roll, index) => (
                    <React.Fragment key={index}>
                      {roll.formula ? <span className="formula">{roll.formula}</span> : null}
                      <span className="total">{roll.total}</span>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }) : <Empty text={t("chat.empty")} />}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <button className="btn" onClick={() => setDice(!dice)} aria-label={t("chat.roll")}>🎲</button>
        <input
          className="grow"
          value={text}
          placeholder={t("chat.placeholder")}
          onChange={event => setText(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") void send(); }}
        />
        <button className="btn primary" disabled={sending || !text.trim()} onClick={() => void send()}>
          ➤
        </button>
      </div>

      {dice ? (
        <>
          <div className="dicebar scrollx">
            {PRESETS.map(f => (
              <button key={f} className={`chip ${formula === f ? "active" : ""}`} onClick={() => setFormula(f)}>{f}</button>
            ))}
          </div>
          <div className="dicebar">
            <input
              className="grow"
              value={formula}
              placeholder={t("chat.formula")}
              autoCapitalize="none"
              spellCheck={false}
              onChange={event => setFormula(event.target.value)}
            />
            <select style={{ width: "auto" }} value={mode} onChange={event => setMode(event.target.value)}>
              {MODES.map(key => <option key={key} value={key}>{modeLabel(key)}</option>)}
            </select>
            <button className="btn primary" disabled={sending || !formula.trim()} onClick={() => void rollFormula()}>
              {t("chat.roll")}
            </button>
          </div>
        </>
      ) : null}

      {zoom ? (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
        </div>
      ) : null}
    </div>
  );
}

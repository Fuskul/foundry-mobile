import React from "react";
import { useStore, conn, bridge } from "../store";
import { useT, Html, Empty } from "../ui/common";

export function Chat() {
  const t = useT();
  const s = useStore();
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  const visible = React.useMemo(
    () => s.chat.filter(m => !m.whisper?.length || m.whisper.includes(conn.userId)),
    [s.chat]
  );

  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [visible.length]);

  // Card buttons still belong to Foundry, so we ask the bridge to press them.
  async function onCardClick(event: React.MouseEvent<HTMLDivElement>, messageId: string) {
    const el = (event.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!el) return;
    event.preventDefault();
    const action = el.dataset.action!;
    const siblings = [...(event.currentTarget.querySelectorAll(`[data-action="${action}"]`))];
    const index = Math.max(0, siblings.indexOf(el));
    el.setAttribute("disabled", "true");
    try { await bridge.cardAction(messageId, action, index); }
    catch (err) { conn.log("warn", `card action "${action}" failed: ${(err as Error).message}`); }
    finally { el.removeAttribute("disabled"); }
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try { await s.sendChat(text); setText(""); }
    finally { setSending(false); }
  }

  return (
    <div>
      <div className="chatlist">
        {visible.length ? visible.map(m => (
          <div key={m.id} className="msg">
            <div className="who">
              <span className="when">{new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
              {m.alias}
            </div>
            {m.flavor ? <div className="small muted">{m.flavor.replace(/<[^>]*>/g, "")}</div> : null}
            <div onClick={event => void onCardClick(event, m.id)}>
              <Html html={m.content} />
            </div>
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
        )) : <Empty text={t("chat.empty")} />}
        <div ref={endRef} />
      </div>

      <div className="composer">
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
    </div>
  );
}

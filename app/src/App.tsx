import React from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useStore } from "./store";
import { useT, useSwipe } from "./ui/common";
import { Connect } from "./screens/Connect";
import { Character } from "./screens/Character";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";

const TABS = [
  { id: "character", glyph: "🛡" },
  { id: "chat", glyph: "💬" },
  { id: "settings", glyph: "⚙" }
] as const;

export function App() {
  const t = useT();
  const s = useStore();

  React.useEffect(() => { void s.restore(); }, []);

  // Swiping sideways walks the bottom tabs, the way phone apps normally behave.
  const step = (delta: number) => {
    const index = TABS.findIndex(tab => tab.id === s.tab);
    const next = TABS[Math.min(TABS.length - 1, Math.max(0, index + delta))];
    if (next && next.id !== s.tab) s.setTab(next.id);
  };
  const swipe = useSwipe(() => step(1), () => step(-1));

  // A sleeping phone misses everything the socket would have delivered, so the
  // moment the app comes back we reopen the connection and refill the chat.
  React.useEffect(() => {
    const resync = () => { void useStore.getState().resync(); };
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVisible);
    const handle = CapacitorApp.addListener("appStateChange", ({ isActive }) => { if (isActive) resync(); });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void handle.then(h => h.remove());
    };
  }, []);

  if (s.phase === "connect") {
    return (
      <div className="app">
        <header className="topbar">
          <h1 className="serif">{t("app.name")}</h1>
        </header>
        <main className="content"><Connect /></main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className={`dot ${s.connected ? "on" : ""}`} />
        <h1 className="serif">{s.sheet?.name ?? t("app.name")}</h1>
      </header>

      <main className="content" {...swipe}>
        {s.tab === "character" ? <Character /> : null}
        {s.tab === "chat" ? <Chat /> : null}
        {s.tab === "settings" ? <Settings /> : null}
      </main>

      <nav className="tabbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={s.tab === tab.id ? "active" : ""}
            onClick={() => s.setTab(tab.id)}
          >
            <span className="glyph">{tab.glyph}</span>
            <span>{t(`nav.${tab.id}`)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

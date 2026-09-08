import React from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useStore } from "./store";
import { useT } from "./ui/common";
import { Connect } from "./screens/Connect";
import { Character } from "./screens/Character";
import { Dice } from "./screens/Dice";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";

const TABS = [
  { id: "character", glyph: "🛡" },
  { id: "dice", glyph: "🎲" },
  { id: "chat", glyph: "💬" },
  { id: "settings", glyph: "⚙" }
] as const;

export function App() {
  const t = useT();
  const s = useStore();

  React.useEffect(() => { void s.restore(); }, []);

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

      <main className="content">
        {s.tab === "character" ? <Character /> : null}
        {s.tab === "dice" ? <Dice /> : null}
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

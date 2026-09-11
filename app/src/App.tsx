import React from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { useStore } from "./store";
import { useT, useSwipe, usePullToRefresh, mergeTouch, runBack } from "./ui/common";
import { Connect } from "./screens/Connect";
import { Character } from "./screens/Character";
import { Chat } from "./screens/Chat";
import { Settings } from "./screens/Settings";
import { CombatBar } from "./screens/Combat";

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

  // Pull down at the top to refresh whatever the current screen shows.
  const refresh = React.useCallback(async () => {
    if (s.phase === "connect") { await s.checkServers(); return; }
    if (s.tab === "chat") { await s.resync(); return; }
    if (s.tab === "settings") { await s.loadModules(); await s.checkBridge(); return; }
    await s.refreshSheet();
  }, [s.phase, s.tab]);
  const ptr = usePullToRefresh(refresh);

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

  // The Android back button should retrace steps inside the app, not drop the
  // whole thing: walk left through the tabs first, and only leave from the
  // first tab.
  React.useEffect(() => {
    const handle = CapacitorApp.addListener("backButton", () => {
      // First let any open layer (dialog, lightbox, a non-default sheet tab) take it.
      if (runBack()) return;
      const st = useStore.getState();
      if (st.phase === "app" && st.tab !== TABS[0].id) {
        const index = TABS.findIndex(tab => tab.id === st.tab);
        st.setTab(TABS[Math.max(0, index - 1)].id);
        return;
      }
      // Nothing left to step back to: send the app to the background (standard
      // Android behaviour from the home screen), never a hard exit.
      CapacitorApp.minimizeApp?.();
    });
    return () => { void handle.then(h => h.remove()); };
  }, []);

  const Indicator = (ptr.pull > 0 || ptr.refreshing) ? (
    <div className="ptr" style={{ transform: `translateY(${Math.max(0, ptr.pull - 8)}px)` }}>
      <span>
        {ptr.refreshing
          ? <><i className="spin">↻</i> {t("common.refreshing")}</>
          : (ptr.pull >= ptr.threshold ? t("common.releaseRefresh") : t("common.pullRefresh"))}
      </span>
    </div>
  ) : null;

  if (s.phase === "connect") {
    return (
      <div className="app">
        <header className="topbar">
          <h1 className="serif">{t("app.name")}</h1>
        </header>
        <main className="content" style={{ position: "relative" }} {...ptr.handlers}>
          {Indicator}
          <Connect />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className={`dot ${s.connected ? "on" : ""}`} />
        <h1 className="serif">{s.sheet?.name ?? t("app.name")}</h1>
      </header>

      <CombatBar />

      <main className={`content ${s.combat ? "with-combat" : ""}`} style={{ position: "relative" }} {...mergeTouch(swipe, ptr.handlers)}>
        {Indicator}
        {s.tab === "character" ? <Character /> : null}
        {s.tab === "chat" ? <Chat /> : null}
        {s.tab === "settings" ? <Settings /> : null}
      </main>

      {s.notices.length ? (
        <div className="notices">
          {s.notices.map(note => (
            <button key={note.id} className={`notice-toast ${note.level}`} onClick={() => s.dismissNotice(note.id)}>
              {note.text}
            </button>
          ))}
        </div>
      ) : null}

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

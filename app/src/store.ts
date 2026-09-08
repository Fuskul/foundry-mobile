import { create } from "zustand";
import { Preferences } from "@capacitor/preferences";
import { FoundryConnection, type ServerStatus, type JoinUser } from "./foundry/client";
import { defaultBase } from "./foundry/http";
import { Bridge, type BridgeInfo } from "./foundry/bridge";
import { detectLang, type Lang } from "./i18n";

export const conn = new FoundryConnection();
export const bridge = new Bridge(conn);

export interface ChatEntry {
  id: string;
  alias: string;
  content: string;
  flavor: string;
  timestamp: number;
  whisper: string[];
  blind: boolean;
  rolls: { formula: string; total: number }[];
}

export type Theme = "dark" | "light" | "system";

export type Phase = "connect" | "app";
export type Tab = "character" | "dice" | "chat" | "settings";

interface State {
  lang: Lang;
  theme: Theme;
  phase: Phase;
  tab: Tab;

  base: string;
  servers: string[];
  users: JoinUser[];
  usersError: string;
  worldTitle: string;
  userId: string;
  username: string;
  password: string;
  remember: boolean;
  probed: boolean;
  status: ServerStatus;

  busy: string | null;
  error: string | null;
  connected: boolean;
  logVersion: number;

  bridgeInfo: BridgeInfo | null;
  bridgeError: string | null;
  systemConfig: any;

  actors: any[];
  actorsLoading: boolean;
  actorScope: "mine" | "characters";
  actorId: string | null;
  sheet: any | null;
  sheetError: string | null;
  chat: ChatEntry[];

  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  edit: (path: string, value: unknown, itemId?: string, mode?: "set" | "toggle" | "step") => Promise<void>;
  toggleCondition: (key: string, remove: boolean) => Promise<void>;
  resync: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setField: <K extends keyof State>(key: K, value: State[K]) => void;

  restore: () => Promise<void>;
  forgetServer: (base: string) => void;
  probe: (base: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkBridge: () => Promise<void>;
  loadActors: (scope?: "mine" | "characters") => Promise<void>;
  openActor: (actorId: string) => Promise<void>;
  refreshSheet: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
}

const KEY = "foundry-mobile:settings";

export const useStore = create<State>((set, get) => ({
  lang: detectLang(),
  theme: "dark",
  phase: "connect",
  tab: "character",

  base: defaultBase(),
  servers: [],
  users: [],
  usersError: "",
  worldTitle: "",
  userId: "",
  username: "",
  password: "",
  remember: true,
  probed: !!defaultBase(),
  status: {},

  busy: null,
  error: null,
  connected: false,
  logVersion: 0,

  bridgeInfo: null,
  bridgeError: null,
  systemConfig: null,

  actors: [],
  actorsLoading: false,
  actorScope: "mine",
  actorId: null,
  sheet: null,
  sheetError: null,
  chat: [],

  setLang: lang => { set({ lang }); void persist(get()); },

  setTheme: theme => {
    set({ theme });
    applyTheme(theme);
    void persist({ ...get(), theme });
  },

  /** Change one field on the sheet, then pull the recomputed sheet back. */
  async edit(path, value, itemId, mode = "set") {
    const actorId = get().actorId;
    if (!actorId) return;
    try {
      await bridge.edit(actorId, path, value, itemId, mode);
      await get().refreshSheet();
    } catch (err) {
      set({ sheetError: (err as Error).message });
    }
  },

  async toggleCondition(key, remove) {
    const actorId = get().actorId;
    if (!actorId) return;
    try {
      await bridge.condition(actorId, key, remove);
      await get().refreshSheet();
    } catch (err) {
      set({ sheetError: (err as Error).message });
    }
  },

  /** Catch up after the phone was asleep: reconnect if needed, then refill chat. */
  async resync() {
    if (get().phase !== "app") return;
    try {
      if (!conn.connected) {
        conn.log("info", "waking up: reopening the connection");
        await conn.connect();
        bridge.attach();
        set({ connected: true });
      }
      const newest = get().chat.reduce((max, m) => Math.max(max, m.timestamp), 0);
      const missed = await bridge.chatlog(newest);
      const entries = (missed ?? []).map(toEntry).filter(Boolean) as ChatEntry[];
      if (entries.length) set(s => ({ chat: mergeChat(s.chat, entries) }));
      await get().refreshSheet();
    } catch (err) {
      conn.log("warn", `resync failed: ${String((err as Error).message ?? err)}`);
    }
  },
  setTab: tab => set({ tab }),
  setField: (key, value) => set({ [key]: value } as any),

  async restore() {
    try {
      const { value } = await Preferences.get({ key: KEY });
      if (!value) return;
      const saved = JSON.parse(value);
      set({
        lang: saved.lang ?? detectLang(),
        theme: saved.theme ?? "dark",
        base: defaultBase() || saved.base || "",
        servers: Array.isArray(saved.servers) ? saved.servers : (saved.base ? [saved.base] : []),
        userId: saved.userId ?? "",
        username: saved.username ?? "",
        password: saved.password ?? "",
        remember: saved.remember ?? true
      });
      applyTheme(saved.theme ?? "dark");
      if (defaultBase()) void get().probe(defaultBase());
    } catch { /* first run */ }
  },

  forgetServer(base) {
    const servers = get().servers.filter(s => s !== base);
    set({ servers });
    void persist({ ...get(), servers });
  },

  async probe(base) {
    set({ busy: "probe", error: null });
    try {
      const { status, users } = await conn.probe(base);
      const saved = get().userId;
      const servers = [conn.base, ...get().servers.filter(s => s !== conn.base)].slice(0, 8);
      set({
        status,
        users,
        servers,
        usersError: conn.joinError,
        worldTitle: conn.worldTitle,
        base: conn.base,
        busy: null,
        probed: true,
        userId: users.some(u => u.id === saved) ? saved : (users[0]?.id ?? "")
      });
      void persist(get());
    } catch (err) {
      set({ busy: null, probed: false, users: [], error: (err as Error).message });
    }
  },

  async login() {
    const { userId, users, password } = get();
    const name = users.find(u => u.id === userId)?.name ?? get().username;
    set({ busy: "login", error: null });
    try {
      await conn.login(userId, name, password);
      set({ username: name });
      await conn.connect();
      bridge.attach();
      set({ phase: "app", connected: true, busy: null, chat: readChat(conn.world) });
      await persist(get());
      void get().checkBridge();
      void get().loadActors();
    } catch (err) {
      set({ busy: null, error: (err as Error).message });
    }
  },

  async logout() {
    await conn.disconnect();
    bridge.dispose();
    set({ phase: "connect", connected: false, actors: [], sheet: null, actorId: null, chat: [], bridgeInfo: null });
  },

  async checkBridge() {
    try {
      const info = await bridge.ping();
      set({ bridgeInfo: info, bridgeError: null });
      try { set({ systemConfig: await bridge.config() }); } catch { /* optional */ }
    } catch (err) {
      set({ bridgeInfo: null, bridgeError: (err as Error).message });
    }
  },

  async loadActors(scope) {
    const wanted = scope ?? get().actorScope;
    set({ actorsLoading: true });
    try {
      const actors = await bridge.actors(wanted);
      set({ actors, actorScope: wanted, bridgeError: null });
      const current = get().actorId;
      if (!current && actors.length) void get().openActor(actors[0].id);
    } catch (err) {
      set({ bridgeError: (err as Error).message });
    } finally {
      set({ actorsLoading: false });
    }
  },

  async openActor(actorId) {
    set({ actorId, sheet: null, sheetError: null });
    try {
      set({ sheet: await bridge.sheet(actorId) });
    } catch (err) {
      set({ sheetError: (err as Error).message });
    }
  },

  async refreshSheet() {
    const id = get().actorId;
    if (!id) return;
    try { set({ sheet: await bridge.sheet(id), sheetError: null }); }
    catch (err) { set({ sheetError: (err as Error).message }); }
  },

  async sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await bridge.chat(trimmed, get().actorId ?? undefined);
  }
}));

async function persist(state: Pick<State, "lang" | "theme" | "base" | "servers" | "userId" | "username" | "remember" | "password">) {
  const payload = {
    lang: state.lang,
    theme: state.theme,
    base: state.base,
    userId: state.userId,
    username: state.username,
    remember: state.remember,
    password: state.remember ? state.password : ""
  };
  await Preferences.set({ key: KEY, value: JSON.stringify(payload) });
}

/* --------------------------------------------------------- live plumbing */

function readChat(world: any): ChatEntry[] {
  const messages: any[] = world?.messages ?? [];
  return mergeChat([], messages.slice(-200).map(toEntry).filter(Boolean) as ChatEntry[]);
}

function applyTheme(theme: Theme) {
  try { document.documentElement.dataset.theme = theme; } catch { /* not a browser */ }
}

/** Rolls travel either as objects or as JSON strings, depending on the route. */
function readRolls(message: any): { formula: string; total: number }[] {
  const raw = message?.rolls ?? [];
  return (Array.isArray(raw) ? raw : [])
    .map(r => {
      if (typeof r === "string") { try { return JSON.parse(r); } catch { return null; } }
      return r;
    })
    .filter(Boolean)
    .map((r: any) => ({ formula: String(r.formula ?? ""), total: Number(r.total ?? 0) }))
    .filter(r => r.formula || Number.isFinite(r.total));
}

export function toEntry(message: any): ChatEntry | null {
  if (!message) return null;
  return {
    id: message._id ?? message.id ?? String(Math.random()),
    alias: message.speaker?.alias ?? message.alias ?? "",
    content: String(message.content ?? ""),
    flavor: String(message.flavor ?? ""),
    timestamp: Number(message.timestamp ?? Date.now()),
    whisper: message.whisper ?? [],
    blind: !!message.blind,
    rolls: readRolls(message)
  };
}

conn.on("log", () => useStore.setState(s => ({ logVersion: s.logVersion + 1 })));
conn.on("status", () => useStore.setState({ connected: conn.connected }));

conn.on("chat", (result: any[]) => {
  const entries = (result ?? []).map(toEntry).filter(Boolean) as ChatEntry[];
  if (!entries.length) return;
  useStore.setState(s => ({ chat: mergeChat(s.chat, entries) }));
});

/** The same message can arrive more than once; keep one copy, newest wins. */
function mergeChat(existing: ChatEntry[], incoming: ChatEntry[]): ChatEntry[] {
  const seen = new Map(existing.map(m => [m.id, m]));
  for (const entry of incoming) seen.set(entry.id, entry);
  return [...seen.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-300);
}

conn.on("document", ({ type }: { type: string }) => {
  if (type === "Actor" || type === "Item" || type === "ActiveEffect") scheduleRefresh();
});

conn.on("bridge:actorChanged", (message: any) => {
  const current = useStore.getState().actorId;
  if (current && message?.actorIds?.includes(current)) scheduleRefresh();
});

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useStore.getState().refreshSheet();
  }, 700);
}

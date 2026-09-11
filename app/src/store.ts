import { create } from "zustand";
import { Preferences } from "@capacitor/preferences";
import { FoundryConnection, type ServerStatus, type JoinUser } from "./foundry/client";
import { defaultBase, http, normaliseBase } from "./foundry/http";
import { Bridge, type BridgeInfo } from "./foundry/bridge";
import { detectLang, translate, type Lang } from "./i18n";

/**
 * A raw transport error ("timeout", "not connected") means nothing to a player.
 * The only reason a ping goes unanswered is that no browser in the world is
 * running the bridge — because none is a GM/owner online, or the module is off —
 * so say that, in the app's language.
 */
function bridgeMessage(err: unknown, lang: Lang): string {
  const raw = (err as Error)?.message ?? String(err);
  if (/timeout|not connected|disconnected/i.test(raw)) return translate(lang, "bridge.noHost");
  return raw;
}

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

export interface ServerEntry { url: string; name: string }
export interface ServerStatus2 {
  checking?: boolean;
  online?: boolean;
  version?: string;
  system?: string;
  systemVersion?: string;
  world?: string;
  players?: number;
}

export interface Notice { id: number; level: string; text: string }

export type Phase = "connect" | "app";
export type Tab = "character" | "chat" | "settings";

interface State {
  lang: Lang;
  theme: Theme;
  phase: Phase;
  tab: Tab;

  base: string;
  servers: ServerEntry[];
  serverStatus: Record<string, ServerStatus2>;
  users: JoinUser[];
  activeUsers: string[];
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
  worldModules: any | null;
  notices: Notice[];
  combat: any | null;
  targetId: string | null;

  actors: any[];
  actorsLoading: boolean;
  actorScope: "mine" | "characters";
  actorId: string | null;
  sheet: any | null;
  sheetStale: boolean;
  sheetError: string | null;
  chat: ChatEntry[];

  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  edit: (path: string, value: unknown, itemId?: string, mode?: "set" | "toggle" | "step") => Promise<void>;
  advance: (kind: "skill" | "characteristic" | "talent", target: number, key?: string, itemId?: string) => Promise<void>;
  dismissNotice: (id: number) => void;
  loadModules: () => Promise<void>;
  loadCombat: () => Promise<void>;
  combatAction: (action: string, combatantId?: string) => Promise<void>;
  setTarget: (combatantId: string | null) => void;
  toggleEffect: (effectId: string, disabled: boolean) => Promise<void>;
  toggleCondition: (key: string, remove: boolean) => Promise<void>;
  resync: () => Promise<void>;
  setTab: (tab: Tab) => void;
  setField: <K extends keyof State>(key: K, value: State[K]) => void;

  restore: () => Promise<void>;
  enterLocal: (seedChat: any[]) => Promise<void>;
  forgetServer: (base: string) => void;
  addServer: (url: string, name: string) => void;
  renameServer: (url: string, name: string) => void;
  checkServers: () => Promise<void>;
  probe: (base: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkBridge: () => Promise<void>;
  loadActors: (scope?: "mine" | "characters") => Promise<void>;
  openActor: (actorId: string) => Promise<void>;
  refreshSheet: () => Promise<void>;
  sendChat: (text: string) => Promise<void>;
}

/** Keep the remembered user if still valid, else the first one not already in the game. */
function pickUser(users: JoinUser[], active: string[], saved: string): string {
  if (saved && users.some(u => u.id === saved)) return saved;
  const free = users.find(u => !active.includes(u.id));
  return (free ?? users[0])?.id ?? "";
}

const KEY = "foundry-mobile:settings";

export const useStore = create<State>((set, get) => ({
  lang: detectLang(),
  theme: "dark",
  phase: "connect",
  tab: "character",

  base: defaultBase(),
  servers: [],
  serverStatus: {},
  users: [],
  activeUsers: [],
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
  worldModules: null,
  notices: [],
  combat: null,
  targetId: null,

  actors: [],
  actorsLoading: false,
  actorScope: "mine",
  actorId: null,
  sheet: null,
  sheetStale: false,
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

  /**
   * Advances cost experience, and the system asks for confirmation on whichever
   * browser writes them — which would be the host's, not this phone's. The
   * module does the arithmetic instead and writes the result in one go.
   */
  async advance(kind, target, key, itemId) {
    const actorId = get().actorId;
    if (!actorId) return;
    try {
      await bridge.advance(actorId, kind, target, key, itemId);
      await get().refreshSheet();
      set({ sheetError: null });
    } catch (err) {
      set({ sheetError: (err as Error).message });
    }
  },

  dismissNotice: id => set(s => ({ notices: s.notices.filter(nt => nt.id !== id) })),

  async loadModules() {
    try { set({ worldModules: await bridge.modules() }); }
    catch (err) { conn.log("warn", `module list failed: ${(err as Error).message}`); }
  },

  async loadCombat() {
    try {
      const combat = await bridge.combat();
      set(s => ({ combat, targetId: combat?.combatants?.some((c: any) => c.id === s.targetId) ? s.targetId : null }));
    } catch (err) { conn.log("warn", `combat load failed: ${(err as Error).message}`); }
  },

  async combatAction(action, combatantId) {
    try { await bridge.combatAction(action, combatantId); await get().loadCombat(); }
    catch (err) { set({ sheetError: (err as Error).message }); }
  },

  setTarget: combatantId => set(s => ({ targetId: s.targetId === combatantId ? null : combatantId })),

  async toggleEffect(effectId, disabled) {
    const actorId = get().actorId;
    if (!actorId) return;
    try { await bridge.effect(actorId, effectId, disabled); await get().refreshSheet(); }
    catch (err) { set({ sheetError: (err as Error).message }); }
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
    if (conn.local) { await get().refreshSheet(); return; }
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
      const saved = value ? JSON.parse(value) : {};
      // Embedded in a Foundry client: only personal prefs matter, the rest of
      // the connect flow is skipped (enterLocal drives the app).
      if (conn.local) {
        set({ lang: saved.lang ?? detectLang(), theme: saved.theme ?? "dark" });
        applyTheme(saved.theme ?? "dark");
        return;
      }
      if (!value) return;
      set({
        lang: saved.lang ?? detectLang(),
        theme: saved.theme ?? "dark",
        base: defaultBase() || saved.base || "",
        servers: readServers(saved),
        userId: saved.userId ?? "",
        username: saved.username ?? "",
        password: saved.password ?? "",
        remember: saved.remember ?? true
      });
      applyTheme(saved.theme ?? "dark");
      void get().checkServers();
      if (defaultBase()) void get().probe(defaultBase());
    } catch { /* first run */ }
  },

  /** Come up already connected, as the client we live inside. */
  async enterLocal(seedChat) {
    const entries = (seedChat ?? []).map(toEntry).filter(Boolean) as ChatEntry[];
    set({
      phase: "app",
      connected: true,
      base: conn.base,
      userId: conn.userId,
      username: conn.userName || "",
      chat: mergeChat([], entries)
    });
    void get().checkBridge();
    void get().loadActors();
    void get().loadModules();
    void get().loadCombat();
  },

  forgetServer(base) {
    const servers = get().servers.filter(s => s.url !== base);
    set({ servers });
    void persist({ ...get(), servers });
  },

  addServer(url, name) {
    const clean = normaliseBase(url);
    if (!clean) return;
    const servers = [...get().servers.filter(s => s.url !== clean), { url: clean, name: name.trim() || hostOf(clean) }];
    set({ servers });
    void persist({ ...get(), servers });
    void get().checkServers();
  },

  renameServer(url, name) {
    const servers = get().servers.map(s => (s.url === url ? { ...s, name: name.trim() || hostOf(url) } : s));
    set({ servers });
    void persist({ ...get(), servers });
  },

  /** Ping every saved address so the list can show who is up, like FLC does. */
  async checkServers() {
    const servers = get().servers;
    set({ serverStatus: Object.fromEntries(servers.map(s => [s.url, { ...get().serverStatus[s.url], checking: true }])) });
    await Promise.all(servers.map(async entry => {
      let status: ServerStatus2 = { online: false, checking: false };
      try {
        const res = await http({ url: `${entry.url}/api/status` });
        const data = JSON.parse(res.data);
        status = {
          checking: false,
          online: data?.active !== false,
          version: data?.version,
          system: data?.system,
          systemVersion: data?.systemVersion,
          world: data?.world,
          players: data?.activeUsers ?? data?.users
        };
      } catch { /* stays offline */ }
      set(s => ({ serverStatus: { ...s.serverStatus, [entry.url]: status } }));
    }));
  },

  async probe(base) {
    set({ busy: "probe", error: null });
    try {
      const { status, users } = await conn.probe(base);
      const saved = get().userId;
      const known = get().servers;
      const servers = known.some(s => s.url === conn.base)
        ? known
        : [...known, { url: conn.base, name: hostOf(conn.base) }].slice(0, 12);
      set({
        status,
        users,
        servers,
        usersError: conn.joinError,
        worldTitle: conn.worldTitle,
        activeUsers: conn.activeUsers,
        base: conn.base,
        busy: null,
        probed: true,
        userId: pickUser(users, conn.activeUsers, saved)
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
      void get().loadModules();
      void get().loadCombat();
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
      set({ bridgeInfo: null, bridgeError: bridgeMessage(err, get().lang) });
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
      set({ bridgeError: bridgeMessage(err, get().lang) });
    } finally {
      set({ actorsLoading: false });
    }
  },

  async openActor(actorId) {
    const cached = await readSheetCache(actorId);
    set({ actorId, sheet: cached, sheetStale: !!cached, sheetError: null });
    try {
      const sheet = await bridge.sheet(actorId);
      set({ sheet, sheetStale: false, sheetError: null });
      void writeSheetCache(actorId, sheet);
    } catch (err) {
      // Keep whatever we last knew, marked read-only, instead of a blank screen.
      set({ sheetStale: !!get().sheet, sheetError: get().sheet ? null : bridgeMessage(err, get().lang) });
    }
  },

  async refreshSheet() {
    const id = get().actorId;
    if (!id) return;
    try {
      const sheet = await bridge.sheet(id);
      set({ sheet, sheetStale: false, sheetError: null });
      void writeSheetCache(id, sheet);
    } catch (err) {
      set({ sheetStale: !!get().sheet, sheetError: get().sheet ? null : bridgeMessage(err, get().lang) });
    }
  },

  async sendChat(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await bridge.chat(trimmed, get().actorId ?? undefined);
  }
}));

async function writeSheetCache(actorId: string, sheet: any) {
  try { await Preferences.set({ key: `foundry-mobile:sheet:${actorId}`, value: JSON.stringify(sheet) }); } catch { /* full storage is fine to ignore */ }
}

async function readSheetCache(actorId: string): Promise<any | null> {
  try {
    const { value } = await Preferences.get({ key: `foundry-mobile:sheet:${actorId}` });
    return value ? JSON.parse(value) : null;
  } catch { return null; }
}

async function persist(state: Pick<State, "lang" | "theme" | "base" | "servers" | "userId" | "username" | "remember" | "password">) {
  const payload = {
    lang: state.lang,
    theme: state.theme,
    base: state.base,
    servers: state.servers,
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

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url.replace(/^https?:\/\//, ""); }
}

/** Older versions stored plain addresses; keep those working. */
function readServers(saved: any): ServerEntry[] {
  const list = Array.isArray(saved?.servers) ? saved.servers : saved?.base ? [saved.base] : [];
  return list
    .map((entry: any) => (typeof entry === "string" ? { url: entry, name: hostOf(entry) } : entry))
    .filter((entry: any) => entry?.url);
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

conn.on("bridge:chatDeleted", (message: any) => {
  const id = message?.id;
  if (!id) return;
  useStore.setState(s => ({ chat: s.chat.filter(m => m.id !== id) }));
});

conn.on("bridge:combatChanged", () => {
  if (useStore.getState().phase === "app") void useStore.getState().loadCombat();
});

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void useStore.getState().refreshSheet();
  }, 700);
}

let noticeId = 0;
conn.on("bridge:notes", (notes: { level: string; text: string }[]) => {
  const entries = (notes ?? [])
    .filter(note => note?.text)
    .map(note => ({ id: ++noticeId, level: note.level ?? "info", text: note.text }));
  if (!entries.length) return;
  useStore.setState(s => ({ notices: [...s.notices, ...entries].slice(-4) }));
  setTimeout(() => {
    const ids = new Set(entries.map(e => e.id));
    useStore.setState(s => ({ notices: s.notices.filter(nt => !ids.has(nt.id)) }));
  }, 6000);
});

import { io, Socket } from "socket.io-client";
import { http, normaliseBase } from "./http";

export interface JoinUser { id: string; name: string; role?: number }
export interface ServerStatus {
  active?: boolean;
  version?: string;
  world?: string;
  system?: string;
  systemVersion?: string;
  users?: number;
  activeUsers?: number;
}

export type LogLevel = "info" | "warn" | "error";
export interface LogLine { at: number; level: LogLevel; text: string }

type Listener = (...args: any[]) => void;

/**
 * A minimal Foundry VTT client: it performs the same /join handshake the web
 * client does, opens the same socket.io channel, and keeps a copy of the world
 * data. Everything that *writes* goes through the bridge module instead.
 */
export class FoundryConnection {
  base = "";
  session = "";
  socket: Socket | null = null;
  userId = "";
  world: any = null;
  logs: LogLine[] = [];

  private listeners = new Map<string, Set<Listener>>();

  /* ------------------------------------------------------------- utilities */

  log(level: LogLevel, text: string) {
    this.logs.push({ at: Date.now(), level, text });
    if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);
    this.emit("log");
    if (level === "error") console.error("[FoundryMobile]", text);
    else console.log("[FoundryMobile]", text);
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(fn => {
      try { fn(...args); } catch (err) { console.error(err); }
    });
  }

  private get routePrefix(): string {
    try { return new URL(this.base).pathname.replace(/\/+$/, ""); }
    catch { return ""; }
  }

  /* ---------------------------------------------------------------- probing */

  /** Ask the server who it is and which users can log in. */
  async probe(rawBase: string): Promise<{ status: ServerStatus; users: JoinUser[] }> {
    const base = normaliseBase(rawBase);
    this.base = base;
    this.log("info", `probing ${base}`);

    let status: ServerStatus = {};
    try {
      const res = await http({ url: `${base}/api/status` });
      if (res.status === 200) status = JSON.parse(res.data);
      this.log("info", `status ${res.status}: ${JSON.stringify(status)}`);
    } catch (err) {
      this.log("warn", `/api/status failed: ${String(err)}`);
    }

    const join = await http({ url: `${base}/join` });
    if (join.status >= 400) throw new Error(`Server answered ${join.status} on /join`);
    this.captureSession(join.headers);
    const users = parseJoinUsers(join.data);
    this.log("info", `found ${users.length} user(s) on the join page`);
    if (!users.length) this.log("warn", "could not read the user list from /join");
    return { status, users };
  }

  private captureSession(headers: Record<string, string>) {
    const raw = headers["set-cookie"] ?? "";
    const fromHeader = /(?:^|[;,\s])session=([^;,\s]+)/.exec(raw)?.[1];
    if (fromHeader) {
      this.session = decodeURIComponent(fromHeader);
      this.log("info", `session from header: ${mask(this.session)}`);
      return;
    }
    const fromCookie = /(?:^|;\s*)session=([^;]+)/.exec(document.cookie ?? "")?.[1];
    if (fromCookie) {
      this.session = decodeURIComponent(fromCookie);
      this.log("info", `session from document.cookie: ${mask(this.session)}`);
    }
  }

  /* ----------------------------------------------------------------- login */

  async login(userId: string, password: string): Promise<void> {
    const body = { action: "join", userid: userId, password: password ?? "" };
    const res = await http({
      url: `${this.base}/join`,
      method: "POST",
      body,
      headers: this.session ? { Cookie: `session=${this.session}` } : {}
    });
    this.captureSession(res.headers);

    let payload: any = {};
    try { payload = JSON.parse(res.data); } catch { /* Foundry may answer with HTML on failure */ }

    if (res.status >= 400 || payload?.error) {
      throw new Error(payload?.error ?? `Login failed (HTTP ${res.status})`);
    }
    this.userId = userId;
    this.log("info", `logged in as ${userId}, redirect=${payload?.redirect ?? "-"}`);
  }

  /* ---------------------------------------------------------------- socket */

  async connect(): Promise<void> {
    await this.disconnect();
    const path = `${this.routePrefix}/socket.io`;
    this.log("info", `opening socket ${this.base}${path} (session ${mask(this.session)})`);

    const socket = io(this.base, {
      path,
      transports: ["websocket", "polling"],
      query: { session: this.session },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true
    });
    this.socket = socket;

    socket.on("connect", () => { this.log("info", "socket connected"); this.emit("status"); });
    socket.on("disconnect", reason => { this.log("warn", `socket disconnected: ${reason}`); this.emit("status"); });
    socket.on("connect_error", err => { this.log("error", `socket error: ${err?.message ?? err}`); this.emit("status"); });
    socket.on("session", (data: any) => {
      this.log("info", `session event: ${JSON.stringify(data)}`);
      if (data?.userId) this.userId = data.userId;
    });
    socket.on("modifyDocument", (response: any) => this.onModifyDocument(response));
    socket.on("userActivity", (userId: string, activity: any) => this.emit("userActivity", userId, activity));

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for the socket")), 20000);
      socket.once("connect", () => { clearTimeout(timer); resolve(); });
      socket.once("connect_error", err => { clearTimeout(timer); reject(err); });
    });

    this.world = await this.requestWorld();
    this.emit("world", this.world);
  }

  private requestWorld(): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for world data")), 30000);
      this.socket!.emit("world", (data: any) => {
        clearTimeout(timer);
        const users = data?.users?.length ?? 0;
        const actors = data?.actors?.length ?? 0;
        this.log("info", `world received: ${users} users, ${actors} actors, system ${data?.system?.id ?? "?"}`);
        if (data?.userId) this.userId = data.userId;
        resolve(data);
      });
    });
  }

  /** Foundry pushes every document change through this one event. */
  private onModifyDocument(response: any) {
    const type = response?.type ?? response?.request?.type;
    const action = response?.action ?? response?.request?.action;
    const result = response?.result ?? [];
    if (!type) return;
    this.emit("document", { type, action, result, raw: response });
    if (type === "ChatMessage" && action === "create") this.emit("chat", result);
  }

  async disconnect() {
    if (!this.socket) return;
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.log("info", "socket closed");
  }

  get connected() { return !!this.socket?.connected; }
  get me() { return this.world?.users?.find((u: any) => u._id === this.userId) ?? null; }
}

/* -------------------------------------------------------------------------- */

function mask(value: string) {
  if (!value) return "(none)";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** The /join page lists every user in a <select name="userid">. */
export function parseJoinUsers(html: string): JoinUser[] {
  const users: JoinUser[] = [];
  const select = /<select[^>]*name=["']userid["'][\s\S]*?<\/select>/i.exec(html)?.[0] ?? html;
  const option = /<option[^>]*value=["']([a-zA-Z0-9]{8,})["'][^>]*>([\s\S]*?)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = option.exec(select))) {
    const name = match[2].replace(/<[^>]*>/g, "").trim();
    if (name) users.push({ id: match[1], name: decodeEntities(name) });
  }
  return users;
}

function decodeEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

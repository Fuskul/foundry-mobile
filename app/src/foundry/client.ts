import { io, Socket } from "socket.io-client";
import { http, normaliseBase, isNative, readCookie } from "./http";

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
  userName = "";
  joinError = "";
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

  /**
   * Ask the server who it is and which users may log in.
   * Foundry 14 no longer lists users on the join page: the list arrives over a
   * socket that is open before anyone has logged in, as "getJoinData".
   */
  async probe(rawBase: string): Promise<{ status: ServerStatus; users: JoinUser[] }> {
    const base = normaliseBase(rawBase);
    this.base = base;
    this.log("info", `probing ${base}`);

    let status: ServerStatus = {};
    const res = await http({ url: `${base}/api/status` });
    if (res.status >= 400) throw new Error(`Server answered ${res.status} on /api/status`);
    try { status = JSON.parse(res.data); }
    catch { throw new Error("This does not look like a Foundry server"); }
    this.log("info", `status: ${JSON.stringify(status)}`);
    if (status.active === false) throw new Error("No world is running on this server");

    // The join page hands out the session the socket needs.
    try {
      const join = await http({ url: `${base}/join` });
      this.captureSession(join.headers);
      await this.captureSessionFromJar();
      this.log("info", `GET /join -> ${join.status}`);
    } catch (err) {
      this.log("warn", `GET /join failed: ${String(err)}`);
    }

    const users = await this.readJoinData();
    return { status, users };
  }

  /** Open a throwaway socket just long enough to read the user list. */
  private readJoinData(): Promise<JoinUser[]> {
    return new Promise(resolve => {
      let socket: Socket | null = null;
      const finish = (users: JoinUser[], note: string) => {
        this.joinError = users.length ? "" : note;
        this.log(users.length ? "info" : "warn", `getJoinData: ${note}`);
        try { socket?.disconnect(); } catch { /* already gone */ }
        resolve(users);
      };

      try {
        socket = this.openSocket();
      } catch (err) {
        return finish([], `could not open socket (${String(err)})`);
      }

      const timer = setTimeout(() => finish([], "timed out"), 15000);

      socket.on("connect_error", err => {
        clearTimeout(timer);
        finish([], `socket error: ${err?.message ?? err}`);
      });

      socket.on("connect", () => {
        socket!.emit("getJoinData", (data: any) => {
          clearTimeout(timer);
          const users: JoinUser[] = (data?.users ?? []).map((u: any) => ({
            id: u._id ?? u.id,
            name: u.name,
            role: u.role
          }));
          finish(users, `${users.length} user(s)`);
        });
      });
    });
  }

  /** Native builds cannot read the cookie from the document, so ask the jar. */
  private async captureSessionFromJar() {
    if (this.session || !isNative()) return;
    const value = await readCookie(this.base, "session");
    if (value) {
      this.session = value;
      this.log("info", `session from the native store: ${mask(value)}`);
    }
  }

  private captureSession(headers: Record<string, string>) {
    const names = Object.keys(headers ?? {});
    this.log("info", `headers: ${names.join(", ") || "(none)"}`);

    // Different HTTP stacks expose the cookie header under different names.
    for (const [key, value] of Object.entries(headers ?? {})) {
      if (!/cookie/i.test(key)) continue;
      const found = /(?:^|[;,\s])session=([^;,\s]+)/.exec(String(value))?.[1];
      if (found) {
        this.session = decodeURIComponent(found);
        this.log("info", `session from "${key}": ${mask(this.session)}`);
        return;
      }
    }

    const fromDocument = /(?:^|;\s*)session=([^;]+)/.exec(document.cookie ?? "")?.[1];
    if (fromDocument) {
      this.session = decodeURIComponent(fromDocument);
      this.log("info", `session from the page: ${mask(this.session)}`);
    }
  }

  /* ----------------------------------------------------------------- login */

  async login(userId: string, username: string, password: string): Promise<void> {
    const body = { action: "join", userId, username, password: password ?? "" };
    const res = await http({
      url: `${this.base}/join`,
      method: "POST",
      body,
      headers: this.session ? { Cookie: `session=${this.session}` } : {}
    });
    this.captureSession(res.headers);
    await this.captureSessionFromJar();

    // Success comes back as JSON; failures are a bare localisation key.
    const raw = (res.data ?? "").trim();
    let payload: any = null;
    try { payload = JSON.parse(raw); } catch { /* plain text error */ }
    this.log("info", `POST /join -> ${res.status} ${raw.slice(0, 160)}`);

    const failed = res.status >= 400 || payload?.status === "failed" || (!payload && !!raw);
    if (failed) throw new Error(payload?.error ?? payload?.message ?? raw ?? `HTTP ${res.status}`);

    this.userId = userId;
    this.userName = username;
  }

  /* ---------------------------------------------------------------- socket */

  /** Build a socket.io connection to this server. */
  private openSocket(): Socket {
    const path = `${this.routePrefix}/socket.io`;
    return io(this.base, {
      path,
      // Inside the app the page origin is not the Foundry server, so socket.io's
      // long-polling fallback would be blocked as a cross-origin request.
      // WebSockets are exempt from that rule, so native builds go straight to it.
      transports: isNative() ? ["websocket"] : ["websocket", "polling"],
      query: this.session ? { session: this.session } : {},
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true
    });
  }

  async connect(): Promise<void> {
    await this.disconnect();
    this.log("info", `opening socket ${this.base}${this.routePrefix}/socket.io (session ${mask(this.session)})`);

    const socket = this.openSocket();
    this.socket = socket;

    socket.on("connect", () => { this.log("info", "socket connected"); this.emit("status"); });
    socket.on("disconnect", reason => { this.log("warn", `socket disconnected: ${reason}`); this.emit("status"); });
    socket.on("connect_error", err => { this.log("error", `socket error: ${err?.message ?? err}`); this.emit("status"); });
    socket.on("session", (data: any) => {
      this.log("info", `bound to user ${data?.userId ?? "?"}`);
      if (data?.userId) this.userId = data.userId;
    });
    socket.on("modifyDocument", (response: any) => this.onModifyDocument(response));
    socket.onAny((event: string, ...args: any[]) => {
      if (event === "modifyDocument" || event.startsWith("module.")) return;
      this.log("info", `<- ${event} ${JSON.stringify(args).slice(0, 160)}`);
    });
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


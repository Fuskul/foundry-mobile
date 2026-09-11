import { io, Socket } from "socket.io-client";
import { http, normaliseBase, isNative, readCookies, writeCookie } from "./http";

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

/** Chatty events that would otherwise drown the log (cursor movement, mostly). */
const QUIET_EVENTS = new Set(["modifyDocument", "userActivity"]);

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
  worldTitle = "";
  activeUsers: string[] = [];
  world: any = null;
  logs: LogLine[] = [];
  /** When set, the app runs *inside* a Foundry client and calls handlers in-process. */
  local: ((action: string, payload: any) => Promise<any>) | null = null;

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

  /**
   * Open a socket before anyone has logged in and read the user list from it.
   *
   * Android does not hand us the session cookie (the native HTTP stack keeps it
   * in a jar the WebSocket cannot see), so we take the session from the server
   * instead: Foundry announces it on the socket right after connecting. That id
   * is then good for the login request and for the real connection.
   */
  private readJoinData(): Promise<JoinUser[]> {
    return new Promise(resolve => {
      let socket: Socket | null = null;
      let done = false;
      let asked = 0;

      const finish = (users: JoinUser[], note: string) => {
        if (done) return;
        done = true;
        this.joinError = users.length ? "" : note;
        this.log(users.length ? "info" : "warn", `getJoinData: ${note}`);
        clearTimeout(timer);
        if (users.length && socket?.connected) {
          // Keep it: the session already lives on this connection, so after the
          // login we can simply ask it for the world instead of handshaking again.
          this.adopt(socket);
        } else {
          try { socket?.disconnect(); } catch { /* already gone */ }
        }
        resolve(users);
      };

      const ask = (why: string) => {
        if (done || !socket?.connected) return;
        asked += 1;
        this.log("info", `asking for the user list (${why}, attempt ${asked})`);
        socket.emit("getJoinData", (data: any) => {
          this.worldTitle = String(data?.world?.title ?? data?.world?.id ?? "");
          // Ids the server reports as already in the game, so the app can grey
          // them out — you cannot log in as a user who is already connected.
          this.activeUsers = Array.isArray(data?.activeUsers) ? data.activeUsers.map(String) : [];
          const users: JoinUser[] = (data?.users ?? []).map((u: any) => ({
            id: u._id ?? u.id,
            name: u.name,
            role: u.role
          }));
          if (users.length) finish(users, `${users.length} user(s)`);
          else this.log("warn", `empty answer to attempt ${asked}`);
        });
      };

      try {
        socket = this.openSocket();
      } catch (err) {
        return finish([], `could not open socket (${String(err)})`);
      }

      const timer = setTimeout(
        () => finish([], asked ? "the server never answered" : "the socket never connected"),
        20000
      );

      socket.on("connect", () => {
        this.log("info", `join socket connected via ${socket?.io?.engine?.transport?.name ?? "?"}`);
        ask("on connect");
      });

      socket.on("connect_error", err => finish([], `socket error: ${err?.message ?? err}`));

      // The session announcement is what makes the server treat us as a client.
      socket.on("session", (data: any) => {
        this.log("info", `session announced: ${JSON.stringify(data ?? {}).slice(0, 140)}`);
        if (data?.sessionId && data.sessionId !== this.session) {
          this.session = data.sessionId;
          this.log("info", `session from the socket: ${mask(this.session)}`);
        }
        if (data?.userId) this.userId = data.userId;
        ask("after the session was announced");
      });

      // Some builds answer only once the handshake has fully settled.
      setTimeout(() => ask("second try"), 2500);
    });
  }

  /** Native builds cannot read the cookie from the document, so ask the jar. */
  private async captureSessionFromJar() {
    if (!isNative()) return;
    const jar = await readCookies(this.base);
    const names = Object.keys(jar);
    this.log("info", `cookie store holds: ${names.join(", ") || "(nothing)"}`);
    if (!this.session && jar.session) {
      this.session = jar.session;
      this.log("info", `session from the cookie store: ${mask(jar.session)}`);
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

  /**
   * Hand the logged-in session to the WebView's own cookie store, so a full-page
   * navigation to `/game` (in-client mode) is already authenticated. In a normal
   * browser the login response set the cookie already; this is for the native
   * app, where the session otherwise stays in a jar the navigation cannot see.
   */
  async persistSessionCookie(): Promise<void> {
    if (!isNative() || !this.session || !this.base) return;
    await writeCookie(this.base, "session", this.session);
  }

  /* ---------------------------------------------------------------- socket */

  /** Build a socket.io connection to this server. */
  private openSocket(): Socket {
    const path = `${this.routePrefix}/socket.io`;
    return io(this.base, {
      path,
      // A bare WebSocket handshake from the app carries no cookies, so the server
      // sees an anonymous connection. Long polling goes through the native HTTP
      // stack instead, which does hold the session, and the connection then
      // upgrades to a WebSocket while keeping the session it established.
      transports: ["polling", "websocket"],
      upgrade: true,
      query: this.session ? { session: this.session } : {},
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true
    });
  }

  /** Attach the standard listeners and keep this socket as the live connection. */
  private adopt(socket: Socket) {
    // Never leave an older connection running: two live sockets means every
    // event arrives twice.
    if (this.socket && this.socket !== socket) {
      this.log("info", "closing the previous connection");
      try { this.socket.removeAllListeners(); this.socket.disconnect(); } catch { /* already gone */ }
    }
    this.socket = socket;
    socket.removeAllListeners("connect_error");
    socket.on("disconnect", reason => { this.log("warn", `socket disconnected: ${reason}`); this.emit("status"); });
    socket.on("connect_error", err => { this.log("error", `socket error: ${err?.message ?? err}`); this.emit("status"); });
    socket.on("modifyDocument", (response: any) => this.onModifyDocument(response));
    socket.on("userActivity", (userId: string, activity: any) => this.emit("userActivity", userId, activity));
    socket.onAny((event: string, ...args: any[]) => {
      if (QUIET_EVENTS.has(event) || event.startsWith("module.")) return;
      this.log("info", `<- ${event} ${JSON.stringify(args).slice(0, 160)}`);
    });
    this.emit("status");
  }

  async connect(): Promise<void> {
    // The socket opened before login already carries our session; try it first.
    if (this.socket?.connected) {
      this.log("info", "reusing the connection opened before login");
      try {
        this.world = await this.requestWorld(10000);
        this.emit("world", this.world);
        return;
      } catch (err) {
        this.log("warn", `the existing connection did not answer (${String((err as Error).message ?? err)}), reconnecting`);
      }
    }

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
      if (QUIET_EVENTS.has(event) || event.startsWith("module.")) return;
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

  private requestWorld(timeoutMs = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for world data")), timeoutMs);
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

  get connected() { return this.local ? true : !!this.socket?.connected; }
  get me() { return this.world?.users?.find((u: any) => u._id === this.userId) ?? null; }
}

/* -------------------------------------------------------------------------- */

function mask(value: string) {
  if (!value) return "(none)";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}


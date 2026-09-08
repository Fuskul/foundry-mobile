import type { FoundryConnection } from "./client";

export const MODULE_ID = "fvtt-mobile-bridge";
export const SOCKET_EVENT = `module.${MODULE_ID}`;

interface Pending {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  seen: Set<string>;
}

export interface BridgeInfo {
  protocol: number;
  module: string;
  foundry: string;
  system: { id: string; title: string; version: string };
  world: { id: string; title: string };
  adapter: string;
  executor: { id: string; name: string; isGM: boolean };
  lang: string;
}

/**
 * Talks to the fvtt-mobile-bridge module running in a desktop browser client.
 * Every request is a socket broadcast; exactly one client answers.
 */
export class Bridge {
  info: BridgeInfo | null = null;
  private pending = new Map<string, Pending>();
  private detach: (() => void) | null = null;
  private counter = 0;

  constructor(private conn: FoundryConnection) {}

  attach() {
    this.dispose();
    const socket = this.conn.socket;
    if (!socket) return;
    const handler = (message: any) => this.onMessage(message);
    socket.on(SOCKET_EVENT, handler);
    this.detach = () => socket.off(SOCKET_EVENT, handler);
  }

  dispose() {
    this.detach?.();
    this.detach = null;
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error("disconnected")); }
    this.pending.clear();
  }

  private onMessage(message: any) {
    if (message?.t === "evt") {
      this.conn.emit(`bridge:${message.event}`, message);
      return;
    }
    if (message?.t !== "res") return;
    if (message.to && message.to !== this.conn.userId) return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.ok) entry.resolve(message.data);
    else entry.reject(new Error(message.error ?? "Bridge error"));
  }

  /**
   * Send one request. If nobody answers in time we retry once in "any" mode,
   * which lets every eligible client respond (the first answer wins).
   */
  async request<T = any>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 12000): Promise<T> {
    try {
      return await this.send<T>(action, payload, timeoutMs, undefined);
    } catch (err) {
      if ((err as Error).message !== "timeout") throw err;
      this.conn.log("warn", `no answer for "${action}", retrying in broadcast mode`);
      return this.send<T>(action, payload, timeoutMs, "any");
    }
  }

  private send<T>(action: string, payload: Record<string, unknown>, timeoutMs: number, exec?: string): Promise<T> {
    const socket = this.conn.socket;
    if (!socket?.connected) return Promise.reject(new Error("not connected"));
    const id = `${this.conn.userId}-${Date.now()}-${this.counter++}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, seen: new Set() });
      socket.emit(SOCKET_EVENT, { t: "req", id, action, payload, from: this.conn.userId, exec });
    });
  }

  /* --------------------------------------------------------------- helpers */

  async ping(): Promise<BridgeInfo> {
    this.info = await this.request<BridgeInfo>("ping", {}, 8000);
    return this.info;
  }

  actors(scope: "mine" | "characters" | "all" = "mine", query = "") {
    return this.request<any[]>("actors", { scope, query });
  }
  sheet(actorId: string) { return this.request<any>("sheet", { actorId }, 20000); }
  config() { return this.request<any>("config"); }
  combat() { return this.request<any>("combat"); }

  roll(actorId: string, kind: string, key: string, fields: Record<string, unknown> = {}, skipDialog = true) {
    return this.request<any>("roll", { actorId, kind, key, fields, skipDialog }, 30000);
  }

  edit(actorId: string, path: string, value: unknown, itemId?: string, mode: "set" | "toggle" | "step" = "set") {
    return this.request<any>("edit", { actorId, path, value, itemId, mode });
  }

  condition(actorId: string, key: string, remove = false) {
    return this.request<any>("condition", { actorId, key, remove });
  }

  chatlog(since = 0, limit = 60) {
    return this.request<any[]>("chatlog", { since, limit }, 20000);
  }

  /** Buy or refund advances; the module does the experience arithmetic. */
  advance(actorId: string, kind: "skill" | "characteristic", target: number, key?: string, itemId?: string) {
    return this.request<any>("advance", { actorId, kind, target, key, itemId }, 20000);
  }

  /** Answer an opposed test as the defender, without a dialog on the host. */
  opposed(actorId: string, messageId: string, optionId: string, fields: Record<string, unknown> = {}) {
    return this.request<any>("opposed", { actorId, messageId, optionId, fields }, 30000);
  }

  /** Use an item through the system's own API — works for module item types. */
  useItem(actorId: string, itemId: string) {
    return this.request<any>("useItem", { actorId, itemId }, 30000);
  }

  /** What a card offers to press, with readable names. */
  messageActions(messageId: string) {
    return this.request<any>("messageActions", { messageId }, 15000);
  }

  cardAction(messageId: string, action: string, index = 0) {
    return this.request<any>("cardAction", { messageId, action, index });
  }

  chat(content: string, actorId?: string, rollMode = "publicroll") {
    return this.request<any>("chat", { content, actorId, rollMode });
  }

  resource(actorId: string, path: string, value: number) {
    return this.request<any>("resource", { actorId, path, value });
  }
}

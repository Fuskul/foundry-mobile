import { conn, useStore } from "../store";

/**
 * The handle the module publishes on the page when the app is embedded inside a
 * running Foundry client (opened with ?fvttmobile=1). Everything the app would
 * normally ask a remote host for is answered by this same client, so no GM and
 * no separate connection are needed — the phone *is* the client.
 */
interface LocalBridge {
  origin: string;
  userId: string;
  userName?: string;
  handle: (action: string, payload: any) => Promise<any>;
}

export function detectLocal(): LocalBridge | null {
  return (window as any).__fvttMobileLocal ?? null;
}

/**
 * Wire the app to the surrounding Foundry client: route bridge calls in-process,
 * and turn the client's own document hooks into the same events the store already
 * listens for over the socket, so nothing downstream has to know the difference.
 */
export function bootstrapLocal(local: LocalBridge) {
  conn.base = local.origin;
  conn.userId = local.userId;
  conn.userName = local.userName ?? "";
  conn.local = (action, payload) => local.handle(action, payload);

  const g: any = (window as any).game;
  const Hooks: any = (window as any).Hooks;

  const toEntry = (m: any) => ({
    _id: m.id,
    content: m.content,
    flavor: m.flavor,
    speaker: m.speaker,
    timestamp: m.timestamp,
    whisper: m.whisper ?? [],
    blind: !!m.blind,
    rolls: (m.rolls ?? []).map((r: any) => ({ formula: r.formula, total: r.total }))
  });

  if (Hooks?.on) {
    Hooks.on("createChatMessage", (m: any) => conn.emit("chat", [toEntry(m)]));
    Hooks.on("updateChatMessage", (m: any) => conn.emit("chat", [toEntry(m)]));
    Hooks.on("deleteChatMessage", (m: any) => conn.emit("bridge:chatDeleted", { id: m.id }));

    const touched = (type: string) => conn.emit("document", { type });
    Hooks.on("updateActor", () => touched("Actor"));
    Hooks.on("createItem", () => touched("Item"));
    Hooks.on("updateItem", () => touched("Item"));
    Hooks.on("deleteItem", () => touched("Item"));
    Hooks.on("createActiveEffect", () => touched("ActiveEffect"));
    Hooks.on("updateActiveEffect", () => touched("ActiveEffect"));
    Hooks.on("deleteActiveEffect", () => touched("ActiveEffect"));

    for (const h of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
      Hooks.on(h, () => conn.emit("bridge:combatChanged"));
    }
  }

  // Seed the chat from what the client already has, then let the app take over.
  const seed = (g?.messages?.contents ?? []).slice(-200).map(toEntry);
  void useStore.getState().enterLocal(seed);
}

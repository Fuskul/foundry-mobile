import { http, normaliseBase, isNative } from "./http";
import { conn, bridge } from "../store";

export type StepState = "pending" | "running" | "ok" | "fail" | "skip";

export interface Step {
  id: string;
  state: StepState;
  detail: string;
}

const STEP_IDS = ["reach", "status", "join", "login", "socket", "world", "bridge"] as const;

export function emptySteps(): Step[] {
  return STEP_IDS.map(id => ({ id, state: "pending" as StepState, detail: "" }));
}

/**
 * Walks the whole connection the same way the app does, recording what happened
 * at every stage. Reporting one of these beats reading a log.
 */
export async function runSelfTest(
  rawBase: string,
  username: string,
  password: string,
  onUpdate: (steps: Step[]) => void
): Promise<Step[]> {
  const steps = emptySteps();
  const set = (id: string, state: StepState, detail = "") => {
    const step = steps.find(s => s.id === id)!;
    step.state = state;
    step.detail = detail;
    onUpdate([...steps]);
  };

  const base = normaliseBase(rawBase);
  set("reach", "running");

  // 1. Can we reach the host at all?
  try {
    const res = await http({ url: `${base}/api/status` });
    set("reach", "ok", `HTTP ${res.status}${isNative() ? " (native)" : " (browser)"}`);

    // 2. Does it answer like Foundry?
    set("status", "running");
    const status = JSON.parse(res.data);
    set("status", "ok", `Foundry ${status.version}, ${status.system} ${status.systemVersion}, world "${status.world}"`);
  } catch (err) {
    set("reach", "fail", String((err as Error).message ?? err));
    set("status", "skip");
    set("join", "skip"); set("login", "skip"); set("socket", "skip"); set("world", "skip"); set("bridge", "skip");
    return steps;
  }

  // 3. Session cookie from the join page.
  set("join", "running");
  try {
    const { status } = await conn.probe(base);
    set("join", "ok", `world "${status.world}", session ${conn.session ? "получена" : "через cookie"}`);
  } catch (err) {
    set("join", "fail", String((err as Error).message ?? err));
  }

  // 4. Login.
  if (!username) {
    set("login", "skip", "имя игрока не заполнено");
    set("socket", "skip"); set("world", "skip"); set("bridge", "skip");
    return steps;
  }
  set("login", "running");
  try {
    await conn.login(username, password);
    set("login", "ok", `вошли как ${username}`);
  } catch (err) {
    set("login", "fail", String((err as Error).message ?? err));
    set("socket", "skip"); set("world", "skip"); set("bridge", "skip");
    return steps;
  }

  // 5 + 6. Socket and world payload.
  set("socket", "running");
  try {
    await conn.connect();
    set("socket", "ok", "соединение открыто");
    const world = conn.world;
    const actors = world?.actors?.length ?? 0;
    const users = world?.users?.length ?? 0;
    set("world", actors || users ? "ok" : "fail", `актёров ${actors}, игроков ${users}`);
  } catch (err) {
    set("socket", "fail", String((err as Error).message ?? err));
    set("world", "skip");
    set("bridge", "skip");
    return steps;
  }

  // 7. Bridge module.
  set("bridge", "running");
  try {
    bridge.attach();
    const info = await bridge.ping();
    set("bridge", "ok", `отвечает ${info.executor?.name}, адаптер ${info.adapter}`);
  } catch (err) {
    set("bridge", "fail", String((err as Error).message ?? err));
  }

  return steps;
}

export function formatSteps(steps: Step[], labels: (id: string) => string): string {
  const glyph: Record<StepState, string> = {
    pending: "·", running: "…", ok: "OK", fail: "FAIL", skip: "-"
  };
  return steps.map(s => `[${glyph[s.state]}] ${labels(s.id)}${s.detail ? ` — ${s.detail}` : ""}`).join("\n");
}

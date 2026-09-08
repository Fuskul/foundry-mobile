import { EXECUTOR_MODE, MODULE_ID } from "./constants.js";
import { debug } from "./log.js";

/** Users that are currently connected. */
function activeUsers() {
  return game.users.filter(u => u.active);
}

/**
 * Decide whether THIS client should answer a request.
 * Election is deterministic so that exactly one browser answers:
 *   1. lowest-id active GM that is not the requester
 *   2. otherwise lowest-id active OWNER of the target actor that is not the requester
 * `mode` "any" lets every eligible client answer (the app de-duplicates by request id).
 */
export function shouldHandle(request) {
  const setting = game.settings.get(MODULE_ID, "executorMode");
  if (setting === EXECUTOR_MODE.NEVER) return false;
  if (setting === EXECUTOR_MODE.ALWAYS) return true;

  const requester = request?.from;
  if (requester === game.user.id) return false; // never answer ourselves

  const eligible = eligibleUsers(request).filter(u => u.id !== requester);
  if (!eligible.length) return false;

  if (request?.exec === "any") return eligible.some(u => u.id === game.user.id);

  const primary = eligible.sort((a, b) => a.id.localeCompare(b.id))[0];
  debug("election", { primary: primary?.name, me: game.user.name });
  return primary?.id === game.user.id;
}

/** Users that could technically serve this request. */
function eligibleUsers(request) {
  const gms = activeUsers().filter(u => u.isGM);
  if (gms.length) return gms;
  const actor = request?.payload?.actorId ? game.actors.get(request.payload.actorId) : null;
  if (!actor) return activeUsers();
  return activeUsers().filter(u => actor.testUserPermission(u, "OWNER"));
}

/** Requesting user object, validated. */
export function requesterOf(request) {
  const user = game.users.get(request?.from);
  return user ?? null;
}

/** Does the requester have the right to touch this actor? */
export function canUseActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  // The character a user is assigned to is always theirs to use.
  if (user.character?.id === actor.id) return true;
  if (!game.settings.get(MODULE_ID, "requireOwnership")) return actor.testUserPermission(user, "OBSERVER");
  return actor.testUserPermission(user, "OWNER");
}

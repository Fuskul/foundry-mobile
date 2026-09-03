export const MODULE_ID = "fvtt-mobile-bridge";
export const SOCKET = `module.${MODULE_ID}`;
export const PROTOCOL_VERSION = 1;

/** Executor selection modes (module setting) */
export const EXECUTOR_MODE = {
  AUTO: "auto",       // primary GM, else first active owner
  ALWAYS: "always",   // this client always answers (debug)
  NEVER: "never"      // this client never answers
};

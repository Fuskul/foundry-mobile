import { MODULE_ID } from "./constants.js";

const PREFIX = "[MobileBridge]";
let verbose = false;

export function setVerbose(v) { verbose = !!v; }
export function debug(...args) { if (verbose) console.log(PREFIX, ...args); }
export function info(...args) { console.log(PREFIX, ...args); }
export function warn(...args) { console.warn(PREFIX, ...args); }
export function error(...args) { console.error(PREFIX, ...args); }
export const moduleId = MODULE_ID;

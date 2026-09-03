import { genericAdapter } from "./generic.js";
import { wfrp4eAdapter } from "./wfrp4e.js";

/** Adapters are tried in order; the first match wins, generic is the catch-all. */
const ADAPTERS = [wfrp4eAdapter, genericAdapter];

export function getAdapter() {
  return ADAPTERS.find(a => a.matches()) ?? genericAdapter;
}

export function adapterIds() {
  return ADAPTERS.map(a => a.id);
}

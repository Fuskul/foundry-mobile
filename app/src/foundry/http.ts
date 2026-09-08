import { Capacitor } from "@capacitor/core";
import { CapacitorHttp, CapacitorCookies } from "@capacitor/core";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  data: string;
}

const isNative = () => Capacitor.isNativePlatform?.() ?? false;

/**
 * One HTTP call that works both in a normal browser (same-origin, served by
 * Foundry) and inside the Android WebView, where CapacitorHttp performs the
 * request natively and therefore is not subject to CORS.
 */
export async function http(options: {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<HttpResponse> {
  const { url, method = "GET", headers = {}, body } = options;

  if (isNative()) {
    const res = await CapacitorHttp.request({
      url,
      method,
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      data: body,
      responseType: "text",
      readTimeout: 15000,
      connectTimeout: 15000
    });
    return {
      status: res.status,
      headers: lowerKeys(res.headers as Record<string, string>),
      data: typeof res.data === "string" ? res.data : JSON.stringify(res.data)
    };
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
  return { status: res.status, headers: out, data: text };
}

function lowerKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k.toLowerCase()] = String(v);
  return out;
}

/** Normalise whatever the user typed into a usable base URL. */
export function normaliseBase(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, "");
  // Strip the Foundry view path if the user pasted the full address bar contents.
  url = url.replace(/\/(game|join|setup|players|auth|stream)$/i, "");
  return url;
}

export { isNative };

/**
 * When the app is served by Foundry itself (…/modules/fvtt-mobile-bridge/app/),
 * the server address is simply where we came from.
 */
export function defaultBase(): string {
  try {
    const { origin, pathname } = window.location;
    const marker = "/modules/fvtt-mobile-bridge/";
    const at = pathname.indexOf(marker);
    if (at < 0) return "";
    return `${origin}${pathname.slice(0, at)}`;
  } catch {
    return "";
  }
}

/** Everything the native cookie jar holds for this server. */
export async function readCookies(url: string): Promise<Record<string, string>> {
  try {
    return (await CapacitorCookies.getCookies({ url } as any)) ?? {};
  } catch {
    return {};
  }
}

/**
 * Resolve an asset path from a Foundry chat card or sheet to a URL the phone
 * can actually load. Relative paths hang off the connected server, and — the
 * common breakage — an absolute URL the desktop stored pointing at localhost
 * or a LAN-local host (which mean "this device" to the phone) is moved onto the
 * server we are actually talking to. Public URLs and data:/blob: are untouched.
 */
export function assetUrl(path: string | undefined, base: string): string {
  if (!path) return "";
  if (/^(data:|blob:)/i.test(path)) return path;
  try {
    const b = new URL(base);
    const u = new URL(path, base.replace(/\/$/, "") + "/");
    if (u.origin !== b.origin && isLocalHost(u.hostname)) {
      u.protocol = b.protocol;
      u.host = b.host;
    }
    return u.href;
  } catch {
    return `${base.replace(/\/$/, "")}/${String(path).replace(/^\.?\//, "")}`;
  }
}

function isLocalHost(host: string): boolean {
  return /^(localhost|0\.0\.0\.0|127\.|\[?::1\]?|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host);
}

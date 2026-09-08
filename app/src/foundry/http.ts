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

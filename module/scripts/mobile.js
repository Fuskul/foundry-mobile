import { MODULE_ID } from "./constants.js";
import { HANDLERS } from "./api.js";

/**
 * "In-client" mode. When a phone opens the world with ?fvttmobile=1, the app is
 * not a remote pointed at someone else's client — it *is* the client. This runs
 * inside the player's own Foundry, so rolls and sheet maths happen locally with
 * no GM and no separate connection: the world just has to be running.
 *
 * The app is mounted into a shadow root so Foundry's global CSS and ours cannot
 * bleed into each other, and it talks to the module's handlers in-process.
 */
function mobileRequested() {
  try {
    return /fvttmobile/i.test(`${location.search} ${location.hash}`);
  } catch {
    return false;
  }
}

Hooks.once("ready", async () => {
  if (!mobileRequested()) return;
  try {
    await embedMobileApp();
  } catch (err) {
    console.error("[MobileBridge] could not embed the mobile app:", err);
  }
});

async function embedMobileApp() {
  document.documentElement.classList.add("fvttmobile-embed");

  // The app sizes everything in rem (root font-size) and expects 16px, but
  // Foundry — or a UI module like crlngn-ui with an interface-scale — can set a
  // smaller root, which would shrink the whole app. Pin it; Foundry's own UI is
  // hidden here anyway. Re-pin if something changes it later.
  const pinRoot = () => {
    // Guard against re-triggering our own observer (setting the value again
    // still fires a mutation), which would loop.
    if (document.documentElement.style.fontSize !== "16px") {
      document.documentElement.style.setProperty("font-size", "16px", "important");
    }
  };
  pinRoot();
  try {
    new MutationObserver(pinRoot).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
  } catch { /* observer optional */ }

  // Stop the board from eating a phone's battery; it is never shown here.
  try { game.canvas?.app?.stop?.(); } catch { /* no canvas is fine */ }
  // Skip the canvas entirely on the next load (much lighter on a phone).
  try {
    if (game.settings.settings.has("core.noCanvas") && !game.settings.get("core", "noCanvas")) {
      await game.settings.set("core", "noCanvas", true);
    }
  } catch { /* optional */ }

  // The in-process bridge the app calls instead of a socket.
  window.__fvttMobileLocal = {
    origin: location.origin,
    userId: game.user.id,
    userName: game.user.name,
    async handle(action, payload) {
      const handler = HANDLERS[action];
      if (!handler) throw new Error(`Unknown action "${action}"`);
      return await handler({ payload: payload ?? {}, user: game.user });
    }
  };

  // A full-screen host with a shadow root: our styles live inside it, Foundry's
  // stay out, and the app mounts onto the inner div.
  const host = document.createElement("div");
  host.id = "fvttmobile-host";
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const mount = document.createElement("div");
  mount.id = "root";
  shadow.appendChild(mount);
  window.__fvttMobileMount = mount;

  // The app's stylesheet paints `body`, which does not exist inside a shadow
  // root, so carry those base rules onto the mount itself. The colour tokens are
  // defined on the shadow's :root by the app CSS, so var(--bg) resolves here.
  const base = document.createElement("style");
  base.textContent = `
    :host, #root { height: 100%; }
    #root {
      display: block; min-height: 100%;
      background: var(--bg); color: var(--ink);
      font-family: "Segoe UI", Roboto, system-ui, -apple-system, sans-serif;
      font-size: 15px; line-height: 1.45;
    }
  `;
  shadow.appendChild(base);

  // Read the built app's own manifest (its index.html) to find the hashed asset
  // names, then load the CSS into the shadow and the script into the page.
  const appBase = `modules/${MODULE_ID}/app/`;
  const indexHtml = await fetch(appBase + "index.html").then(r => r.text());
  const asset = ref => appBase + ref.replace(/^\.?\//, "");

  for (const match of indexHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/gi)) {
    const css = await fetch(asset(match[1])).then(r => r.text()).catch(() => "");
    if (css) {
      const style = document.createElement("style");
      style.textContent = css;
      shadow.appendChild(style);
    }
  }

  for (const match of indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/gi)) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = asset(match[1]);
    document.body.appendChild(script);
  }
}

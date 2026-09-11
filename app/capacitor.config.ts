import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.foundrymobile.companion",
  appName: "Foundry Mobile",
  webDir: "../module/app",
  android: {
    // Foundry servers on a LAN are usually plain http://
    allowMixedContent: true
  },
  server: {
    androidScheme: "http",
    cleartext: true,
    // Let the app navigate its own WebView to any Foundry server for the
    // in-client "no GM" mode (…/game?fvttmobile=1), instead of the OS browser.
    allowNavigation: ["*"]
  },
  plugins: {
    // Native HTTP: requests leave the app instead of the WebView, so the
    // browser's same-origin rules never apply to the Foundry server.
    // Enabled so requests run natively AND their cookies are stored in the
    // WebView's own cookie jar — which is the jar the socket handshake reads.
    CapacitorHttp: { enabled: true },
    // Share the cookie jar with the WebView so the Foundry session cookie is
    // present on the socket.io handshake (Foundry 14 binds sessions by cookie).
    CapacitorCookies: { enabled: true }
  }
};

export default config;

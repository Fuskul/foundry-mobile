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
    cleartext: true
  },
  plugins: {
    // Native HTTP: requests leave the app instead of the WebView, so the
    // browser's same-origin rules never apply to the Foundry server.
    CapacitorHttp: { enabled: false },
    // Share the cookie jar with the WebView so the Foundry session cookie is
    // present on the socket.io handshake (Foundry 14 binds sessions by cookie).
    CapacitorCookies: { enabled: true }
  }
};

export default config;

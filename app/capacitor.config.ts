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
  }
};

export default config;

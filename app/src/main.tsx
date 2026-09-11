import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { detectLocal, bootstrapLocal } from "./foundry/local";
import "./styles.css";

// When the module embeds us inside a running Foundry client it publishes a
// local bridge and a mount point (inside a shadow root, isolated from Foundry's
// own styles). Wire to it before the first render so the app comes up already
// "connected" to the client it lives in.
const local = detectLocal();
if (local) bootstrapLocal(local);

const mount = (window as any).__fvttMobileMount ?? document.getElementById("root")!;

createRoot(mount).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

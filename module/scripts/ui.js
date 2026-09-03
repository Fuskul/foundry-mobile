import qrcode from "./vendor/qrcode.js";
import { MODULE_ID } from "./constants.js";

const L = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Address of the mobile web app served straight out of this module folder. */
export function webAppUrl() {
  const { origin, pathname } = window.location;
  const route = pathname.replace(/\/(game|join|setup|players|auth)\/?$/, "");
  return `${origin}${route}/modules/${MODULE_ID}/app/index.html`;
}

/** Address a native client should be pointed at. */
export function serverUrl() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/\/(game|join|setup|players|auth)\/?$/, "")}`;
}

function qrSvg(text, size = 220) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  let rects = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR">
    <rect width="${size}" height="${size}" fill="#ffffff"/><g fill="#000000">${rects}</g></svg>`;
}

export function renderConnectDialog() {
  const web = webAppUrl();
  const server = serverUrl();
  const content = `
    <div class="fvttmb-connect">
      <p class="fvttmb-hint">${L("FVTTMB.Connect.Intro")}</p>
      <div class="fvttmb-qr">${qrSvg(web)}</div>
      <label>${L("FVTTMB.Connect.WebApp")}</label>
      <div class="fvttmb-row"><input type="text" readonly value="${web}"><button type="button" data-copy="${web}"><i class="fas fa-copy"></i></button></div>
      <label>${L("FVTTMB.Connect.Server")}</label>
      <div class="fvttmb-row"><input type="text" readonly value="${server}"><button type="button" data-copy="${server}"><i class="fas fa-copy"></i></button></div>
      <p class="fvttmb-note">${L("FVTTMB.Connect.Note")}</p>
    </div>`;

  const activate = html => {
    const root = html instanceof HTMLElement ? html : html[0];
    root?.querySelectorAll("[data-copy]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await navigator.clipboard?.writeText(btn.dataset.copy);
        ui.notifications.info(L("FVTTMB.Connect.Copied"));
      });
    });
  };

  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (DialogV2) {
    new DialogV2({
      window: { title: L("FVTTMB.Menu.ConnectLabel"), icon: "fas fa-mobile-screen" },
      content,
      buttons: [{ action: "close", label: L("FVTTMB.Close"), default: true }],
      render: (_event, dialog) => activate(dialog.element)
    }).render({ force: true });
  } else {
    new Dialog({
      title: L("FVTTMB.Menu.ConnectLabel"),
      content,
      buttons: { close: { label: L("FVTTMB.Close") } },
      render: activate
    }).render(true);
  }
}

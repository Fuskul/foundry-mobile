import React from "react";
import { Html, useT, Modal } from "./common";
import { useStore } from "../store";
import { assetUrl } from "../foundry/http";

/** Absolute URL for an image path coming from Foundry, reachable from the phone. */
export function imgUrl(path?: string): string {
  return assetUrl(path, useStore.getState().base);
}

export function Section(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="row spread" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>{props.title}</h2>
        {props.right}
      </div>
      {props.children}
    </section>
  );
}

/** A list row that can carry a tap action and an expandable description. */
export function Row(props: {
  img?: string;
  name: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  onTap?: () => void;
  detail?: { description?: string; properties?: string[] };
}) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = !!(props.detail?.description || props.detail?.properties?.length);

  return (
    <div>
      <div className="rowitem" style={{ marginBottom: hasDetail && open ? "0.15rem" : undefined }}>
        {props.img ? <img src={imgUrl(props.img)} alt="" /> : null}
        <button
          className="name namebtn"
          onClick={() => (props.onTap ? props.onTap() : hasDetail && setOpen(!open))}
        >
          {props.name}
          {props.sub ? <span className="sub">{props.sub}</span> : null}
        </button>
        {hasDetail && props.onTap ? (
          <button className="iconbtn" onClick={() => setOpen(!open)} aria-label="?">
            {open ? "▴" : "▾"}
          </button>
        ) : null}
        {props.right}
      </div>
      {hasDetail && open ? (
        <div className="detail">
          {props.detail?.properties?.length ? (
            <div className="tags">{props.detail.properties.map((p, i) => <span key={i}>{p}</span>)}</div>
          ) : null}
          {props.detail?.description ? <Html html={props.detail.description} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Number field that writes straight to the sheet when it loses focus. */
export function NumEdit(props: { value: number; onCommit: (value: number) => void; width?: number; disabled?: boolean }) {
  const [text, setText] = React.useState(String(props.value));
  React.useEffect(() => setText(String(props.value)), [props.value]);

  return (
    <input
      className="numedit"
      type="number"
      inputMode="numeric"
      disabled={props.disabled}
      style={{ width: props.width ?? 60 }}
      value={text}
      onChange={event => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text);
        if (Number.isFinite(next) && next !== props.value) props.onCommit(next);
        else setText(String(props.value));
      }}
    />
  );
}

/** Small −/+ pair around a value. */
export function Step(props: { value: number | string; onStep: (delta: number) => void; suffix?: React.ReactNode }) {
  return (
    <span className="stepinline">
      <button onClick={() => props.onStep(-1)} aria-label="−">−</button>
      <b>{props.value}{props.suffix}</b>
      <button onClick={() => props.onStep(1)} aria-label="+">+</button>
    </span>
  );
}

export function Check(props: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button className={`checkbtn ${props.on ? "on" : ""}`} onClick={props.onToggle} aria-label={props.label}>
      {props.on ? "✓" : "○"}
    </button>
  );
}

export function TextEdit(props: { value: string; onCommit: (value: string) => void; multiline?: boolean; placeholder?: string }) {
  const [text, setText] = React.useState(props.value);
  React.useEffect(() => setText(props.value), [props.value]);
  const commit = () => { if (text !== props.value) props.onCommit(text); };

  return props.multiline ? (
    <textarea rows={4} value={text} placeholder={props.placeholder} onChange={e => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input type="text" value={text} placeholder={props.placeholder} onChange={e => setText(e.target.value)} onBlur={commit} />
  );
}

/**
 * Prefer the term Foundry itself uses for this world — that way the phone
 * matches whatever translation the table plays with — and fall back to the
 * app's own wording when the world cannot translate that key.
 */
export function useSheetLabels(sheet: any) {
  const t = useT();
  return React.useCallback(
    (key: string, fallback: string) => (sheet?.labels?.[key] as string) || t(fallback),
    [sheet, t]
  );
}

/** Full-screen image viewer. */
export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="" />
    </div>
  );
}

/**
 * The "+" the desktop sheet shows next to anything that can still be advanced
 * in the current career — with the same confirmation, since it spends
 * experience, and a "✓" once the career has nothing left to give.
 */
export function Advance(props: { name: string; cost?: number | null; complete?: boolean; onConfirm: () => Promise<void> | void }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  return (
    <>
      <button
        className={`advbtn ${props.complete ? "done" : ""}`}
        aria-label={t("sheet.advance")}
        onClick={event => { event.stopPropagation(); setOpen(true); }}
      >
        {props.complete ? "✓" : "+"}
      </button>
      <Modal open={open} title={t("sheet.advance")} onClose={() => setOpen(false)}>
        <p style={{ marginTop: 0 }}>
          {props.cost != null
            ? t("sheet.advanceAsk", { name: props.name, cost: props.cost })
            : t("sheet.advanceAskNoCost", { name: props.name })}
        </p>
        <div className="row" style={{ gap: "0.5rem" }}>
          <button className="btn ghost grow" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
          <button
            className="btn primary grow"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try { await props.onConfirm(); setOpen(false); }
              finally { setBusy(false); }
            }}
          >
            {t("sheet.spend")}
          </button>
        </div>
      </Modal>
    </>
  );
}


/**
 * A number field for advances that confirms before spending experience: typing
 * a higher value buys several advances at once (the module works out and checks
 * the cost); lowering it refunds without a prompt.
 */
export function AdvanceEdit(props: { value: number; name: string; width?: number; onAdvance: (target: number) => void }) {
  const t = useT();
  const [text, setText] = React.useState(String(props.value));
  const [ask, setAsk] = React.useState<number | null>(null);
  React.useEffect(() => setText(String(props.value)), [props.value]);

  const commit = () => {
    const next = Number(text);
    if (!Number.isFinite(next) || next === props.value) { setText(String(props.value)); return; }
    if (next > props.value) setAsk(next);
    else props.onAdvance(next);
  };

  return (
    <>
      <input
        className="numedit"
        type="number"
        inputMode="numeric"
        style={{ width: props.width ?? 60 }}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
      />
      <Modal open={ask != null} title={t("sheet.advance")} onClose={() => { setAsk(null); setText(String(props.value)); }}>
        <p style={{ marginTop: 0 }}>{t("sheet.advanceBulk", { name: props.name, from: props.value, to: ask ?? 0 })}</p>
        <div className="row" style={{ gap: "0.5rem" }}>
          <button className="btn ghost grow" onClick={() => { setAsk(null); setText(String(props.value)); }}>{t("common.cancel")}</button>
          <button className="btn primary grow" onClick={() => { const v = ask!; setAsk(null); props.onAdvance(v); }}>{t("sheet.spend")}</button>
        </div>
      </Modal>
    </>
  );
}

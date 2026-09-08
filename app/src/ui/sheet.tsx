import React from "react";
import { Html } from "./common";
import { useStore } from "../store";

/** Absolute URL for an image path coming from Foundry. */
export function imgUrl(path?: string): string {
  if (!path) return "";
  if (/^(https?:|data:)/i.test(path)) return path;
  return `${useStore.getState().base}/${path.replace(/^\//, "")}`;
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

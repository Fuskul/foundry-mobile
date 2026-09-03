import React from "react";
import { useStore } from "../store";
import { translate } from "../i18n";

export function useT() {
  const lang = useStore(s => s.lang);
  return React.useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  );
}

export function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint ? <span className="small muted" style={{ marginTop: "0.2rem" }}>{props.hint}</span> : null}
    </label>
  );
}

export function Card(props: { title?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      {props.title ? <h2>{props.title}</h2> : null}
      {props.children}
    </section>
  );
}

export function Modal(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="backdrop" onClick={props.onClose}>
      <div className="modal" onClick={event => event.stopPropagation()}>{props.children}</div>
    </div>
  );
}

export function Stepper(props: { value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number }) {
  const step = props.step ?? 10;
  const clamp = (value: number) => {
    if (props.min != null && value < props.min) return props.min;
    if (props.max != null && value > props.max) return props.max;
    return value;
  };
  return (
    <div className="stepper">
      <button type="button" onClick={() => props.onChange(clamp(props.value - step))}>−</button>
      <input
        type="number"
        inputMode="numeric"
        value={String(props.value)}
        onChange={event => props.onChange(clamp(Number(event.target.value) || 0))}
      />
      <button type="button" onClick={() => props.onChange(clamp(props.value + step))}>+</button>
    </div>
  );
}

/** Foundry chat cards are trusted HTML from our own server; strip scripts anyway. */
export function Html({ html }: { html: string }) {
  const clean = React.useMemo(
    () => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/ on[a-z]+="[^"]*"/gi, ""),
    [html]
  );
  return <div className="body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function Empty({ text }: { text: string }) {
  return <p className="muted small" style={{ margin: "0.3rem 0" }}>{text}</p>;
}

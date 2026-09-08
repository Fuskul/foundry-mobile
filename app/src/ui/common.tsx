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

export function Modal(props: { open: boolean; title?: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null;
  return (
    <div className="backdrop" onClick={props.onClose}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        {props.title ? (
          <div className="row spread" style={{ marginBottom: "0.6rem" }}>
            <h2 style={{ margin: 0 }}>{props.title}</h2>
            <button className="iconbtn" aria-label="×" onClick={props.onClose}>×</button>
          </div>
        ) : null}
        {props.children}
      </div>
    </div>
  );
}

/**
 * Horizontal swipe recogniser. Vertical drags and pinches are left alone so
 * scrolling and zooming keep working; only a decisive sideways flick counts.
 */
export function useSwipe(onLeft: () => void, onRight: () => void) {
  const start = React.useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart: (event: React.TouchEvent) => {
      if (event.touches.length !== 1) { start.current = null; return; }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    },
    onTouchEnd: (event: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const target = event.target as HTMLElement | null;
      // Sliders, scrollable strips and text fields own their own gestures.
      if (target?.closest("input, textarea, select, .scrollx, .lightbox")) return;
      const native = event.nativeEvent as any;
      if (native.__swipeHandled) return; // an inner strip already used this flick
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Date.now() - from.t > 800) return;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      native.__swipeHandled = true;
      if (dx < 0) onLeft(); else onRight();
    }
  };
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

/**
 * Foundry chat cards are trusted HTML from our own server; strip scripts anyway.
 * Three things have to be adjusted for a phone: image and link paths are
 * relative to the Foundry server, links must not navigate the app away, and
 * buttons that are pure Font Awesome icons on the desktop need their tooltip
 * text as a visible label.
 */
export function Html({ html }: { html: string }) {
  const base = useStore(s => s.base);
  const clean = React.useMemo(() => {
    const absolute = (path: string) => {
      if (/^(https?:|data:|blob:|#)/i.test(path)) return path;
      const trimmed = path.replace(/^\.?\//, "");
      // Foundry paths can carry spaces and Cyrillic; encode what is not encoded.
      const safe = /%[0-9a-f]{2}/i.test(trimmed) ? trimmed : trimmed.split("/").map(encodeURIComponent).join("/");
      return `${base}/${safe}`;
    };
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/ on[a-z]+="[^"]*"/gi, "")
      .replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, (_m, a, src, b) => a + absolute(src) + b)
      .replace(/(<a\b[^>]*?\b)href="([^"]+)"/gi, (_m, a, href) => `${a}data-href="${absolute(href)}"`)
      // An icon-only control says what it does in its tooltip; show that instead.
      .replace(
        /(<a\b[^>]*?\bdata-tooltip="([^"]*)"[^>]*>)\s*(<i\b[^>]*><\/i>)\s*(<\/a>)/gi,
        (_m, open, tip, icon, close) => `${open}${icon}<span class="btnlabel">${tip}</span>${close}`
      );
  }, [html, base]);
  return <div className="body" dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function Empty({ text }: { text: string }) {
  return <p className="muted small" style={{ margin: "0.3rem 0" }}>{text}</p>;
}

import * as React from "react";
import { createPortal } from "react-dom";
import { Pointer } from "lucide-react@0.487.0";

import { Button } from "./button";
import { cn } from "./utils";

// A guided tour over the real screen: everything dims except one part, a finger glides to it and
// taps, and a card next to it explains it. Tapping the lit-up part or Next moves on; Back, Skip
// and Escape work too. A step whose part isn't on screen is passed over (or shown in the middle
// when it has no part). Positions follow scrolling and resizing; motion is off for reduced motion.
//
//   <CoachMarks open={open} steps={steps} onClose={(finished) => ...}
//     labels={{ next: "Next", back: "Back", skip: "Skip", done: "Done", step: (i, n) => `${i} of ${n}` }} />

export type CoachStep = {
  id: string;
  /** The part to light up (the first one on screen); none: the card sits in the middle. */
  target?: () => Element | null;
  /** Pass the step over when its part isn't on screen (a card only some people have). */
  optional?: boolean;
  title: React.ReactNode;
  body: React.ReactNode;
};

type Box = { x: number; y: number; w: number; h: number };
type Labels = { next: string; back: string; skip: string; done: string; step: (i: number, n: number) => string };

const PAD = 6;
const GAP = 14;
const CARD_W = 340;
// Darker than the sheets' scrim, so the one lit-up part stands out in both themes.
const DIM = "rgb(12 10 9 / 0.68)";

/** The first element matching `selector` that is laid out on screen. */
export function firstVisible(selector: string): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

function useReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    setReduce(m.matches);
    const on = () => setReduce(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

function CoachMarks({ open, steps, onClose, labels }: { open: boolean; steps: CoachStep[]; onClose: (finished: boolean) => void; labels: Labels }) {
  const [index, setIndex] = React.useState(0);
  const [box, setBox] = React.useState<Box | null>(null);
  const [cardH, setCardH] = React.useState(220);
  const [view, setView] = React.useState({ w: 0, h: 0 });
  const dir = React.useRef<1 | -1>(1);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const maskId = `tour-hole-${React.useId().replace(/:/g, "")}`;
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (open) {
      dir.current = 1;
      setIndex(0);
    }
  }, [open]);

  const step = open ? steps[index] : undefined;
  const last = index >= steps.length - 1;
  const go = React.useCallback((to: number) => {
    dir.current = to >= index ? 1 : -1;
    if (to < 0) return;
    if (to >= steps.length) onClose(true);
    else setIndex(to);
  }, [index, steps.length, onClose]);
  const next = React.useCallback(() => go(index + 1), [go, index]);

  // Find this step's part, bring it into view, and keep its box up to date.
  React.useEffect(() => {
    if (!step) return;
    let alive = true;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!alive) return;
        setView({ w: window.innerWidth, h: window.innerHeight });
        const el = step.target?.() ?? null;
        setBox(el ? boxOf(el) : null);
      });
    };
    const el = step.target?.() ?? null;
    if (step.target && !el && step.optional) {
      // Not on screen for this person: move on in the same direction.
      const to = index + dir.current;
      if (to < 0) setIndex(0);
      else if (to >= steps.length) onClose(true);
      else setIndex(to);
      return;
    }
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 72 || r.bottom > window.innerHeight - 88) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    measure();
    const settle = setTimeout(measure, 420);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      alive = false;
      clearTimeout(settle);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, index, steps.length, onClose, reduce]);

  React.useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, box, open]);

  React.useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, next, go, onClose]);

  if (!open || !step || typeof document === "undefined") return null;

  // The card goes below the part, else above it, else at the bottom of the screen.
  const vw = view.w || window.innerWidth;
  const vh = view.h || window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 32);
  let cardLeft = (vw - cardW) / 2;
  let cardTop = (vh - cardH) / 2;
  if (box) {
    cardLeft = Math.min(Math.max(16, box.x + box.w / 2 - cardW / 2), vw - cardW - 16);
    if (box.y + box.h + GAP + cardH <= vh - 12) cardTop = box.y + box.h + GAP;
    else if (box.y - GAP - cardH >= 12) cardTop = box.y - GAP - cardH;
    else cardTop = vh - cardH - 16;
  }
  const finger = box ? { x: box.x + box.w / 2 - 6, y: box.y + box.h / 2 - 4 } : null;
  const ease = reduce ? "" : "transition-[left,top,width,height,x,y,transform] duration-500 ease-(--ease-standard)";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-(--z-tour)">
      {/* The dim, with a rounded hole over the lit-up part; it also catches taps outside it. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {box && <rect rx={12} fill="black" className={ease} style={{ x: box.x, y: box.y, width: box.w, height: box.h }} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={DIM} mask={`url(#${maskId})`} />
      </svg>
      {box && (
        <>
          <button
            type="button"
            aria-label={last ? labels.done : labels.next}
            onClick={next}
            className={cn("absolute rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring", ease)}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
          <span
            key={`ring-${index}`}
            aria-hidden="true"
            className={cn("tour-ring pointer-events-none absolute rounded-xl border-2 border-primary", ease)}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          />
        </>
      )}
      {finger && (
        <span aria-hidden="true" className={cn("pointer-events-none absolute left-0 top-0", ease)} style={{ transform: `translate(${finger.x}px, ${finger.y}px)` }}>
          <span key={`ripple-${index}`} className="tour-ripple absolute left-1.5 top-1 size-10 rounded-full bg-on-scrim" />
          <Pointer key={`tap-${index}`} className="tour-tap relative size-9 fill-on-scrim stroke-text drop-shadow-md" strokeWidth={1.5} />
        </span>
      )}
      <div
        ref={cardRef}
        className={cn("absolute flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg", ease)}
        style={{ left: cardLeft, top: cardTop, width: cardW }}
      >
        <span className="num text-label font-medium text-text-3">{labels.step(index + 1, steps.length)}</span>
        <div id={titleId} className="flex flex-col gap-0.5 text-subtitle font-semibold text-text">{step.title}</div>
        <div className="flex flex-col gap-1 text-body-sm text-text-2">{step.body}</div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onClose(false)}>{labels.skip}</Button>
          <div className="flex items-center gap-2">
            {index > 0 && <Button variant="secondary" size="sm" onClick={() => go(index - 1)}>{labels.back}</Button>}
            <Button ref={nextRef} size="sm" onClick={next}>{last ? labels.done : labels.next}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { CoachMarks };

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
// Lessons (components/learn) also have steps the person does themselves (owner, 29 Oct 2026: "the
// tour ... just shows the animation without me actually clicking"):
//   act: "tap"  the lit-up part works as usual - pressing it opens what it opens - and the tour
//               moves on when it is pressed;
//   act: "do"   they use the lit-up part (type a number, tick items), then Next (ready() says when);
//   before / wait  open a screen first, and wait for its part to appear.
//
//   <CoachMarks open={open} steps={steps} onClose={(finished) => ...}
//     labels={{ next: "Next", back: "Back", skip: "Skip", done: "Done", step: (i, n) => `${i} of ${n}` }} />

export type CoachStep = {
  id: string;
  /** The part to light up (the first one on screen); none: the card sits in the middle. */
  target?: () => Element | null;
  /** Pass the step over when its part isn't on screen (a card only some people have). */
  optional?: boolean;
  /** Run once as the step opens (go to a screen, close a sheet). */
  before?: () => void;
  /** How long to wait for the part to appear, in ms (default: look once). */
  wait?: number;
  /** "tap": press the lit-up part to go on. "do": use it, then Next. Default: look, then Next. */
  act?: "tap" | "do";
  /** For "do": Next works once this is true. */
  ready?: () => boolean;
  title: React.ReactNode;
  body: React.ReactNode;
};

type Box = { x: number; y: number; w: number; h: number };
type Labels = {
  next: string; back: string; skip: string; done: string; step: (i: number, n: number) => string;
  /** Under a "tap" step's text. */
  tap?: React.ReactNode;
};

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

function CoachMarks({ open, steps, onClose, labels, noBack = false }: {
  open: boolean;
  steps: CoachStep[];
  onClose: (finished: boolean) => void;
  labels: Labels;
  /** Lessons: a step can't be undone (the tap already opened something), so no Back. */
  noBack?: boolean;
}) {
  const [index, setIndex] = React.useState(0);
  const [box, setBox] = React.useState<Box | null>(null);
  // Is this step's part on screen yet: looking, found, or not there (the card sits in the middle).
  // Kept with the step it is about, so a new step never shows for a moment with the last one's
  // answer (a tap step with a Next button).
  const [seen, setSeen] = React.useState<{ at: number; v: "wait" | "yes" | "no" }>({ at: -1, v: "wait" });
  const found = seen.at === index ? seen.v : "wait";
  const [, setTick] = React.useState(0);
  const [cardH, setCardH] = React.useState(220);
  const [view, setView] = React.useState({ w: 0, h: 0 });
  const dir = React.useRef<1 | -1>(1);
  const moved = React.useRef(-1);
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
  const next = React.useCallback(() => {
    // Once per step: a tap on the part and on Next together move on one step, not two.
    if (moved.current === index) return;
    moved.current = index;
    go(index + 1);
  }, [go, index]);
  React.useEffect(() => { moved.current = -1; }, [index]);

  // Open the step (before), then look for its part until it appears or the wait is over.
  React.useEffect(() => {
    if (!step) return;
    const setFound = (v: "yes" | "no") => setSeen({ at: index, v });
    step.before?.();
    if (!step.target) {
      setBox(null);
      setFound("no");
      return;
    }
    let alive = true;
    let timer = 0;
    const started = Date.now();
    const look = () => {
      if (!alive) return;
      if (step.target!()) {
        setFound("yes");
        return;
      }
      if (Date.now() - started < (step.wait ?? 0)) {
        timer = window.setTimeout(look, 150);
        return;
      }
      if (step.optional) {
        // Not on screen for this person: move on in the same direction.
        const to = index + dir.current;
        if (to < 0) setIndex(0);
        else if (to >= steps.length) onClose(true);
        else setIndex(to);
      } else setFound("no");
    };
    // A step that opens something gives it a moment to start before looking.
    if (step.before) timer = window.setTimeout(look, 250);
    else look();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [step, index, steps.length, onClose]);

  // Bring the part into view, and keep its box up to date.
  React.useEffect(() => {
    if (!step || found !== "yes") return;
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
    const el = step.target?.();
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 72 || r.bottom > window.innerHeight - 88) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
    measure();
    const settle = setTimeout(measure, 420);
    // Parts move as screens finish loading: keep following them.
    const follow = step.act ? window.setInterval(measure, 500) : 0;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      alive = false;
      clearTimeout(settle);
      clearInterval(follow);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, found, reduce]);

  // "tap": move on when the lit-up part is pressed (it still does what it does).
  React.useEffect(() => {
    if (!step || step.act !== "tap" || found !== "yes") return;
    const onClick = (e: MouseEvent) => {
      const el = step.target?.();
      if (el && e.target instanceof Node && el.contains(e.target)) window.setTimeout(next, 450);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, found, next]);

  // "do": Next works once the person has done it (checked on every draw; redrawn while they work).
  React.useEffect(() => {
    if (!step || step.act !== "do" || !step.ready) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 300);
    return () => clearInterval(timer);
  }, [step]);

  React.useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, box, open, found]);

  React.useEffect(() => {
    if (!open) return;
    // Not on a step where they type: Next would take the keyboard away.
    if (!step?.act) nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // A lesson closes sheets with a made-up Escape: only a real key press ends the tour.
      if (!e.isTrusted) return;
      if (e.key === "Escape") onClose(false);
      else if (step?.act) return;
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && !noBack) go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, index, next, go, onClose, noBack, found]);

  if (!open || !step || typeof document === "undefined") return null;

  // The card goes below the part, else above it, else at the bottom of the screen.
  const vw = view.w || window.innerWidth;
  const vh = view.h || window.innerHeight;
  const cardW = Math.min(CARD_W, vw - 32);
  let cardLeft = (vw - cardW) / 2;
  let cardTop = (vh - cardH) / 2;
  if (box) {
    cardLeft = Math.min(Math.max(16, box.x + box.w / 2 - cardW / 2), vw - cardW - 16);
    // While they type, what goes with the field (units, suggestions) is under it: card above.
    if (step.act === "do" && box.y - GAP - cardH >= 12) cardTop = box.y - GAP - cardH;
    else if (box.y + box.h + GAP + cardH <= vh - 12) cardTop = box.y + box.h + GAP;
    else if (box.y - GAP - cardH >= 12) cardTop = box.y - GAP - cardH;
    else cardTop = vh - cardH - 16;
  }
  const ok = step.act !== "do" || !step.ready || step.ready();
  // The part works by itself on tap and do steps; on the others it is a big Next button.
  const live = !!step.act && !!box;
  // A part that can't be pressed (greyed out until something above is right) gets a Next too, so
  // nobody is left stuck on it.
  const tapStep = step.act === "tap" && found === "yes" && !step.target?.()?.matches(":disabled, [aria-disabled='true']");
  const finger = box && step.act !== "do" ? { x: box.x + box.w / 2 - 6, y: box.y + box.h / 2 - 4 } : null;
  const ease = reduce ? "" : "transition-[left,top,width,height,x,y,transform] duration-500 ease-(--ease-standard)";
  // Around a tap step's part, four panes catch taps everywhere else; the part itself is left
  // uncovered. On a "do" step the whole screen works (the unit chips and suggestions sit outside
  // the field); the dim only shows where to look.
  const panes: React.CSSProperties[] = live && box && step.act === "do"
    ? []
    : live && box
    ? [
        { left: 0, top: 0, width: "100%", height: Math.max(0, box.y) },
        { left: 0, top: box.y + box.h, width: "100%", bottom: 0 },
        { left: 0, top: box.y, width: Math.max(0, box.x), height: box.h },
        { left: box.x + box.w, top: box.y, right: 0, height: box.h },
      ]
    : [{ inset: 0 }];

  return createPortal(
    // Taps on the tour stay with the tour, so a sheet under it doesn't take them as "tapped
    // outside" and close. Everything is explicitly tappable (an open sheet turns taps off on the page).
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-coach=""
      className="pointer-events-none fixed inset-0 z-(--z-tour)"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* The dim, with a rounded hole over the lit-up part. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {box && <rect rx={12} fill="black" className={ease} style={{ x: box.x, y: box.y, width: box.w, height: box.h }} />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={DIM} mask={`url(#${maskId})`} />
      </svg>
      {panes.map((style, i) => <div key={i} aria-hidden="true" className="pointer-events-auto absolute" style={style} />)}
      {box && (
        <>
          {!live && (
            <button
              type="button"
              aria-label={last ? labels.done : labels.next}
              onClick={next}
              className={cn("pointer-events-auto absolute rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring", ease)}
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          )}
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
      {found !== "wait" && (
        <div
          ref={cardRef}
          className={cn("pointer-events-auto absolute flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-lg", ease)}
          style={{ left: cardLeft, top: cardTop, width: cardW }}
        >
          <span className="num text-label font-medium text-text-3">{labels.step(index + 1, steps.length)}</span>
          <div id={titleId} className="flex flex-col gap-0.5 text-subtitle font-semibold text-text">{step.title}</div>
          <div className="flex flex-col gap-1 text-body-sm text-text-2">{step.body}</div>
          {tapStep && labels.tap && <div className="flex flex-col gap-0.5 text-label font-medium text-primary">{labels.tap}</div>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onClose(false)}>{labels.skip}</Button>
            <div className="flex items-center gap-2">
              {index > 0 && !noBack && <Button variant="secondary" size="sm" onClick={() => go(index - 1)}>{labels.back}</Button>}
              {!tapStep && <Button ref={nextRef} size="sm" disabled={!ok} onClick={next}>{last ? labels.done : labels.next}</Button>}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

export { CoachMarks };

// Pull down to refresh (owner, 31 Oct 2026: "instead of pressing the top right refresh button").
// At the top of a screen, a finger dragged down brings a round arrow out from under the top bar;
// past the line it turns orange (with a tick on phones that vibrate) and letting go reloads.
// It stays out of the way of everything else that drags:
//   - only when the page is at the very top, and the finger moves down more than sideways
//     (store chips, day strips and tables still swipe left and right)
//   - not inside a list or box that is itself scrolled down, a slider, a camera picture or a
//     drawing area (mark one with data-no-pull)
//   - not while a sheet or menu is open (they sit outside the area it watches)
// The browser's own pull (Chrome reloading the whole website) is turned off in globals.css.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '../ui/utils';

const TRIGGER = 64;      // px the arrow travels (half the finger's) before letting go refreshes
const MAX = 110;
const REST = 48;         // where the arrow waits while refreshing
const SIZE = 40;
const MIN_SPIN_MS = 600; // a quick refresh still shows it happened

function canPull(target: EventTarget | null, area: HTMLElement) {
  if (document.body.hasAttribute('data-scroll-locked')) return false;
  for (let n = target instanceof Element ? target : null; n && n !== area; n = n.parentElement) {
    if (n.scrollTop > 0) return false;
    if (n.hasAttribute('data-no-pull') || n.tagName === 'CANVAS' || n.tagName === 'VIDEO') return false;
    if (n.tagName === 'INPUT' && (n as HTMLInputElement).type === 'range') return false;
    if (n.getAttribute('role') === 'slider') return false;
  }
  return true;
}

function tick() {
  try { navigator.vibrate?.(8); } catch { /* not every phone allows it */ }
}

export function PullToRefresh({ areaRef, anchorRef, onRefresh }: {
  /** Where a pull can start (the top bar and the screen under it). */
  areaRef: RefObject<HTMLElement | null>;
  /** The arrow comes out from this element's top edge (the screen, below the top bar and banners). */
  anchorRef: RefObject<HTMLElement | null>;
  onRefresh: () => unknown;
}) {
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'pulling' | 'refreshing' | 'done'>('idle');
  const [top, setTop] = useState(0);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    let startX = 0, startY = 0, tracking = false, engaged = false, dist = 0;

    const run = async () => {
      busy.current = true;
      setPhase('refreshing');
      setPull(REST);
      const started = Date.now();
      try { await latest.current(); } catch { /* the sync line under the top bar says what failed */ }
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setPhase('done');
      setPull(0);
      setTimeout(() => { setPhase('idle'); busy.current = false; }, 220);
    };

    const onStart = (e: TouchEvent) => {
      tracking = !busy.current && e.touches.length === 1 && window.scrollY <= 0 && canPull(e.target, area);
      if (!tracking) return;
      engaged = false;
      dist = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const { clientX, clientY } = e.touches[0];
      if (!engaged) {
        const dx = clientX - startX, dy = clientY - startY;
        if (dy < -4 || (Math.abs(dx) > 8 && Math.abs(dx) * 1.5 >= dy) || window.scrollY > 0) { tracking = false; return; }
        if (dy < 12 || Math.abs(dx) * 1.5 >= dy) return;
        engaged = true;
        startY = clientY;
        setTop(anchorRef.current?.getBoundingClientRect().top ?? 0);
        setPhase('pulling');
      }
      if (e.cancelable) e.preventDefault();
      const next = Math.max(0, Math.min(MAX, (clientY - startY) * 0.5));
      if (next >= TRIGGER && dist < TRIGGER) tick();
      dist = next;
      setPull(next);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!engaged) return;
      if (dist >= TRIGGER) run();
      else { setPhase('idle'); setPull(0); }
    };

    area.addEventListener('touchstart', onStart, { passive: true });
    area.addEventListener('touchmove', onMove, { passive: false });
    area.addEventListener('touchend', onEnd);
    area.addEventListener('touchcancel', onEnd);
    return () => {
      area.removeEventListener('touchstart', onStart);
      area.removeEventListener('touchmove', onMove);
      area.removeEventListener('touchend', onEnd);
      area.removeEventListener('touchcancel', onEnd);
    };
  }, [areaRef, anchorRef]);

  if (phase === 'idle') return null;
  const progress = Math.min(1, pull / TRIGGER);
  const ready = phase === 'refreshing' || (phase === 'pulling' && pull >= TRIGGER);
  return (
    <div
      aria-hidden="true"
      data-pull-refresh={phase}
      className="pointer-events-none fixed inset-x-0 z-[9] flex justify-center md:pl-20 lg:pl-[248px]"
      style={{
        top,
        transform: `translateY(${pull - SIZE}px)`,
        transition: phase === 'pulling' ? 'none' : 'transform var(--dur-sheet) var(--ease-standard)',
      }}
    >
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-full border border-border bg-surface shadow-md',
          'transition-[color,opacity,scale] duration-(--dur-exit) ease-standard',
          ready ? 'text-primary' : 'text-text-2',
          phase === 'done' && 'scale-50 opacity-0',
        )}
        style={phase === 'pulling' ? { opacity: 0.35 + 0.65 * progress } : undefined}
      >
        <RefreshCw
          className={cn('size-5', phase === 'refreshing' && 'animate-spin')}
          style={phase === 'pulling' ? { transform: `rotate(${progress * 300}deg)` } : undefined}
        />
      </div>
    </div>
  );
}

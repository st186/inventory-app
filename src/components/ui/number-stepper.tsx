import * as React from "react";
import { Minus, Plus } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { useT } from "../../utils/i18n";

// − [value] + for momo quantities and pieces. 44 px buttons; holding a button repeats (and
// speeds up). The middle can be typed into (`editable`, numeric keyboard). Labels read
// "Less chicken" / "More chicken".
//
//   <NumberStepper label="Chicken" value={qty} onChange={setQty} step={10} min={0} />

export type NumberStepperProps = {
  value: number;
  onChange: (value: number) => void;
  /** What is being counted, e.g. "Chicken" (used in the button and field labels). */
  label: string;
  min?: number;
  max?: number;
  step?: number;
  /** Let people type the number (numeric keyboard). */
  editable?: boolean;
  disabled?: boolean;
  /** Text after the number, e.g. "pcs". */
  unit?: string;
  className?: string;
};

const HOLD_DELAY = 400;
const HOLD_INTERVAL = 90;

function NumberStepper({
  value,
  onChange,
  label,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  editable = true,
  disabled = false,
  unit,
  className,
}: NumberStepperProps) {
  const { t } = useT();
  const [draft, setDraft] = React.useState<string | null>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const timers = React.useRef<{ delay?: number; repeat?: number; count: number }>({ count: 0 });

  const clamp = React.useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max]);

  const stop = React.useCallback(() => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = { count: 0 };
  }, []);

  React.useEffect(() => stop, [stop]);

  const bump = React.useCallback(
    (direction: 1 | -1) => {
      const next = clamp(valueRef.current + direction * step);
      if (next !== valueRef.current) {
        valueRef.current = next;
        onChange(next);
      }
      // At the limit the button disables itself and never sees pointerup, so stop here.
      if (next <= min || next >= max) stop();
    },
    [clamp, onChange, step, min, max, stop],
  );

  // Pointer press: one step now, then repeat while held (faster after ten repeats).
  const startHold = (direction: 1 | -1) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    bump(direction);
    stop();
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        timers.current.count += 1;
        bump(direction);
        if (timers.current.count === 10) {
          window.clearInterval(timers.current.repeat);
          timers.current.repeat = window.setInterval(() => bump(direction), HOLD_INTERVAL / 2);
        }
      }, HOLD_INTERVAL);
    }, HOLD_DELAY);
  };

  // Keyboard (Enter/Space) clicks arrive without a pointerdown.
  const onKeyClick = (direction: 1 | -1) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) bump(direction);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(clamp(n));
    setDraft(null);
  };

  const buttonClasses = cn(
    "flex size-11 min-h-11 shrink-0 items-center justify-center bg-surface text-text outline-none",
    "transition-colors duration-(--dur-fast) hover:bg-surface-2 active:bg-surface-3",
    "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    "disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-surface",
    "[&_svg]:size-5",
  );

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="number-stepper"
      className={cn(
        "inline-flex shrink-0 items-stretch overflow-hidden rounded-md border border-border-strong bg-surface",
        disabled && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        className={buttonClasses}
        aria-label={t("common.less", { label })}
        disabled={disabled || value <= min}
        onPointerDown={startHold(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={onKeyClick(-1)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Minus aria-hidden="true" />
      </button>
      <div className="flex w-14 items-center justify-center border-x border-border">
        {editable ? (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={label}
            disabled={disabled}
            value={draft ?? String(value)}
            onFocus={(e) => {
              setDraft(String(value));
              e.currentTarget.select();
            }}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDraft();
                e.currentTarget.blur();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                bump(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                bump(-1);
              }
            }}
            className="num h-11 w-full bg-transparent text-center text-body font-semibold text-text outline-none focus:bg-primary-soft"
          />
        ) : (
          <output aria-live="polite" className="num text-body font-semibold text-text">
            {value}
          </output>
        )}
        {unit && <span className="sr-only">{unit}</span>}
      </div>
      <button
        type="button"
        className={buttonClasses}
        aria-label={t("common.more", { label })}
        disabled={disabled || value >= max}
        onPointerDown={startHold(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onClick={onKeyClick(1)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

export { NumberStepper };

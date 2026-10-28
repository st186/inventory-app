import * as React from "react";

import { cn } from "./utils";
import { useFieldControlProps } from "./field";

// Rupees, the Indian way: ₹3,12,400 (lakh grouping), tabular figures everywhere.
//
//   formatINR(312400)               -> "₹3,12,400"
//   formatINR(1234.5)               -> "₹1,234.50"
//   formatINR(-240, { sign: true }) -> "−₹240"
//   formatCompactINR(1180000)       -> "₹11.8L"     formatCompactINR(9700) -> "₹9.7k"
//   <Money value={10754} />          <Money value={delta} sign />
//   <MoneyInput value={amount} onValueChange={(n) => setAmount(n)} />
//
// Grouping is done by hand rather than with Intl, so it is identical on every phone's WebView.

const MINUS = "−";

/** "1234567" -> "12,34,567" (integer part only). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

export type FormatNumberOptions = {
  /** Fixed decimals. Default: 0 for whole numbers, otherwise 2. */
  decimals?: number;
  /** Show "+" for positive values (and "−" for negative, always shown). */
  sign?: boolean;
};

/** 312400 -> "3,12,400"; 1234.5 -> "1,234.50". */
export function formatNumberIN(value: number | null | undefined, opts: FormatNumberOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const negative = value < 0;
  const abs = Math.abs(value);
  const decimals = opts.decimals ?? (Number.isInteger(Math.round(abs * 100) / 100) ? 0 : 2);
  const fixed = abs.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const body = groupIndian(int) + (frac ? `.${frac}` : "");
  const isZero = Number(fixed) === 0;
  if (negative && !isZero) return `${MINUS}${body}`;
  if (opts.sign && !isZero) return `+${body}`;
  return body;
}

/** 312400 -> "₹3,12,400"; with sign: "+₹240" / "−₹240". */
export function formatINR(value: number | null | undefined, opts: FormatNumberOptions = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const text = formatNumberIN(value, opts);
  if (text.startsWith(MINUS)) return `${MINUS}₹${text.slice(1)}`;
  if (text.startsWith("+")) return `+₹${text.slice(1)}`;
  return `₹${text}`;
}

/** Short form for tight spots and chart axes: ₹950, ₹9.7k, ₹11.8L, ₹1.2Cr. */
export function formatCompactINR(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const negative = value < 0;
  const abs = Math.abs(value);
  const trim = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  let body: string;
  if (abs >= 1e7) body = `${trim(abs / 1e7)}Cr`;
  else if (abs >= 1e5) body = `${trim(abs / 1e5)}L`;
  else if (abs >= 1e3) body = `${trim(abs / 1e3)}k`;
  else body = String(Math.round(abs));
  return `${negative ? MINUS : ""}₹${body}`;
}

/** "₹3,12,400.50" / "3,12,400" / "−240" -> number; "" or junk -> null. */
export function parseINR(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const cleaned = String(text).replace(/[₹,\s]/g, "").replace(MINUS, "-");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type MoneyProps = Omit<React.ComponentProps<"span">, "children"> & {
  value: number | null | undefined;
  decimals?: number;
  /** "+₹240" / "−₹240". */
  sign?: boolean;
  /** ₹9.7k / ₹11.8L. */
  compact?: boolean;
};

/** An amount in rupees with tabular figures. Colour comes from the caller (status only). */
function Money({ value, decimals, sign, compact, className, ...props }: MoneyProps) {
  const text = compact ? formatCompactINR(value) : formatINR(value, { decimals, sign });
  return (
    <span data-slot="money" className={cn("num whitespace-nowrap", className)} {...props}>
      {text}
    </span>
  );
}

/** Keeps what's being typed to digits, one dot and at most `decimals` decimals. */
function sanitize(raw: string, decimals: number, allowNegative: boolean): string {
  let s = raw.replace(MINUS, "-").replace(/[^\d.-]/g, "");
  const negative = allowNegative && s.startsWith("-");
  s = s.replace(/-/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    if (decimals === 0) s = s.slice(0, firstDot);
    else s = s.slice(0, firstDot + 1 + decimals);
  }
  return (negative ? "-" : "") + s;
}

export type MoneyInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange" | "type" | "size"> & {
  value: number | string | null | undefined;
  /** Called on every keystroke with the parsed amount (null when empty) and the raw text. */
  onValueChange: (amount: number | null, raw: string) => void;
  decimals?: number;
  allowNegative?: boolean;
  /** Right-align the figures from tablet width up (the phone keeps them left). */
  alignEndOnDesktop?: boolean;
  wrapperClassName?: string;
};

// Money field: ₹ prefix, decimal keyboard, tabular figures. Shows "3,500" when not being
// edited and plain "3500" while typing (so the cursor never jumps).
const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({
  value,
  onValueChange,
  decimals = 2,
  allowNegative = false,
  alignEndOnDesktop = true,
  wrapperClassName,
  className,
  onFocus,
  onBlur,
  placeholder = "0",
  ...rest
}, ref) {
  const props = useFieldControlProps(rest);
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const numeric = typeof value === "number" ? value : parseINR(value ?? "");

  // The value changed from outside while the field has focus (e.g. voice filled it in).
  React.useEffect(() => {
    if (focused && numeric !== parseINR(draft)) setDraft(numeric === null ? "" : String(numeric));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric]);

  const display = focused
    ? draft
    : numeric === null
      ? ""
      : formatNumberIN(numeric, { decimals: Number.isInteger(numeric) ? 0 : decimals });

  return (
    <div
      data-slot="money-input"
      className={cn(
        "flex h-12 w-full min-w-0 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3",
        "transition-[border-color,box-shadow] duration-(--dur-fast)",
        "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary",
        "has-[input[aria-invalid=true]]:border-danger has-[input:disabled]:bg-surface-2",
        wrapperClassName,
      )}
    >
      <span className="text-body font-semibold text-text-3" aria-hidden="true">
        ₹
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        data-slot="input"
        className={cn(
          "num h-full w-full min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-text outline-none placeholder:font-normal placeholder:text-text-3 disabled:text-text-disabled",
          alignEndOnDesktop && "md:text-right",
          className,
        )}
        placeholder={placeholder}
        value={display}
        onFocus={(e) => {
          setDraft(numeric === null ? "" : String(numeric));
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onChange={(e) => {
          const next = sanitize(e.target.value, decimals, allowNegative);
          setDraft(next);
          onValueChange(parseINR(next), next);
        }}
        {...props}
      />
    </div>
  );
});

export { Money, MoneyInput };

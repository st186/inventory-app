import * as React from 'react';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';

// A number box for weights and counts: numeric keyboard, the unit shown inside the box, and the
// text kept as typed ("3." while typing 3.5) while the parent gets a number or null.
const parse = (s: string): number | null => (s === '' || s === '.' ? null : Number(s));
const show = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export type NumInputProps = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  label?: string;
  unit?: React.ReactNode;
  invalid?: boolean;
  integer?: boolean;
  id?: string;
  className?: string;
  wrapperClassName?: string;
  enterKeyHint?: 'next' | 'done';
  onEnter?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
};

export function NumInput({ value, onChange, label, unit, invalid, integer, id, className, wrapperClassName, enterKeyHint, onEnter, inputRef, disabled }: NumInputProps) {
  const [text, setText] = React.useState(show(value));
  React.useEffect(() => {
    if (parse(text) !== (value ?? null)) setText(show(value));
    // Only when the value changes from outside (a one-tap fix, a loaded draft).
  }, [value]);
  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={text}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      enterKeyHint={enterKeyHint}
      trailing={unit ? <span className="shrink-0 text-body-sm text-text-3">{unit}</span> : undefined}
      wrapperClassName={wrapperClassName}
      className={cn('num', className)}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.').replace(/\s/g, '');
        if (!(integer ? /^\d*$/ : /^\d*\.?\d*$/).test(v)) return;
        setText(v);
        onChange(parse(v));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

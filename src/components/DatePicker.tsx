import React, { useId, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDateIST } from '../utils/timezone';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
  min?: string;
  max?: string;
}

// A date field showing "31 Dec 2025" (IST). Tapping it opens the phone's own date picker -
// that works inside the older pop-ups too, which a calendar sheet stacked on top would not.
export function DatePicker({ value, onChange, label, className = '', min, max }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const handleContainerClick = () => {
    // Try to use showPicker() if available, but gracefully fall back if blocked (e.g., in cross-origin iframes)
    try {
      inputRef.current?.showPicker?.();
    } catch (error) {
      // Silently ignore - the click will naturally trigger the date picker through the underlying input
      // This handles SecurityError in cross-origin iframes
    }
  };

  // Format date for display in IST (e.g., "31 Dec 2025")
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select date';
    return formatDateIST(dateStr);
  };

  const isFullWidth = className.includes('w-full');

  return (
    <div className={isFullWidth ? `w-full ${className}` : `flex items-center gap-2 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className={`text-body-sm font-medium ${isFullWidth ? 'mb-1.5 block text-text' : 'whitespace-nowrap text-text-2'}`}
        >
          {label}
        </label>
      )}
      <div
        onClick={handleContainerClick}
        className={`group relative flex cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-3 transition-colors hover:bg-surface-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary ${isFullWidth ? 'h-12 w-full' : 'h-11 min-w-[160px]'}`}
      >
        <CalendarDays className="size-5 shrink-0 text-text-3" aria-hidden="true" />
        <span className={`num flex-1 text-body-md ${value ? 'text-text' : 'text-text-3'}`}>
          {formatDisplayDate(value)}
        </span>
        <input
          id={id}
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          aria-label={label ? undefined : 'Date'}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

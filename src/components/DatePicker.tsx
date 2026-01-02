import React, { useRef } from 'react';
import { Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
  min?: string;
  max?: string;
}

export function DatePicker({ value, onChange, label, className = '', min, max }: DatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleContainerClick = () => {
    // Try to use showPicker() if available, but gracefully fall back if blocked (e.g., in cross-origin iframes)
    try {
      inputRef.current?.showPicker?.();
    } catch (error) {
      // Silently ignore - the click will naturally trigger the date picker through the underlying input
      // This handles SecurityError in cross-origin iframes
    }
  };

  // Format date for display (e.g., "31 Dec 2025")
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select date';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const isFullWidth = className.includes('w-full');

  return (
    <div className={isFullWidth ? 'w-full' : `flex items-center gap-2 ${className}`}>
      {label && (
        <label className={`text-sm text-gray-600 ${isFullWidth ? 'block mb-2' : 'whitespace-nowrap'}`}>
          {label}
        </label>
      )}
      <div
        onClick={handleContainerClick}
        className={`relative flex items-center gap-2 px-4 py-2 border-2 border-gray-300 rounded-lg bg-white hover:border-purple-400 hover:bg-purple-50 transition-all cursor-pointer group ${isFullWidth ? 'w-full' : 'min-w-[160px]'}`}
      >
        <Calendar className="w-4 h-4 text-gray-500 group-hover:text-purple-600 transition-colors flex-shrink-0 pointer-events-none" />
        <span className="text-sm text-gray-700 group-hover:text-purple-700 transition-colors flex-1 pointer-events-none">
          {formatDisplayDate(value)}
        </span>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  );
}
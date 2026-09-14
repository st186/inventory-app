import { useState, useMemo, useEffect, memo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getTodayIST } from '../utils/timezone';

type Props = {
  selectedDate: string;
  onDateChange: (date: string) => void;
};

export const DateSelector = memo(function DateSelector({ selectedDate, onDateChange }: Props) {
  const [dateRangeOffset, setDateRangeOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Generate 7-day date selector based on current offset
  const dateOptions = useMemo(() => {
    const today = getTodayIST();
    const baseDate = new Date(today);
    baseDate.setDate(baseDate.getDate() + (dateRangeOffset * 7));

    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  }, [dateRangeOffset]);

  // Check if selected date is in current range, if not reset offset
  useEffect(() => {
    if (!dateOptions.includes(selectedDate)) {
      const selected = new Date(selectedDate);
      const today = new Date(getTodayIST());
      const diffDays = Math.floor((selected.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const newOffset = Math.floor(diffDays / 7);
      setDateRangeOffset(newOffset);
    }
  }, [selectedDate, dateOptions]);

  const jumpToToday = () => {
    setDateRangeOffset(0);
    onDateChange(getTodayIST());
  };

  // Navigate to previous week and select middle date
  const handlePrevWeek = () => {
    const newOffset = dateRangeOffset - 1;
    setDateRangeOffset(newOffset);

    // Calculate the middle date of the new week range
    const today = getTodayIST();
    const baseDate = new Date(today);
    baseDate.setDate(baseDate.getDate() + (newOffset * 7));
    const newSelectedDate = baseDate.toISOString().split('T')[0];
    onDateChange(newSelectedDate);
  };

  // Navigate to next week and select middle date
  const handleNextWeek = () => {
    const newOffset = dateRangeOffset + 1;
    setDateRangeOffset(newOffset);

    // Calculate the middle date of the new week range
    const today = getTodayIST();
    const baseDate = new Date(today);
    baseDate.setDate(baseDate.getDate() + (newOffset * 7));
    const newSelectedDate = baseDate.toISOString().split('T')[0];
    onDateChange(newSelectedDate);
  };

  const dayCellClass = (isSelected: boolean, isToday: boolean) =>
    `rounded-xl text-center transition-all duration-150 ${
      isSelected
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
        : isToday
        ? 'bg-secondary text-primary ring-1 ring-primary/40'
        : 'bg-muted/60 text-foreground hover:bg-secondary/70'
    }`;

  // Mobile view with native date picker + navigation
  if (isMobile) {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-medium text-foreground">Select Date</h2>
          </div>
          {dateRangeOffset !== 0 && (
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-1.5 bg-secondary text-primary rounded-full hover:opacity-80 transition-opacity text-xs font-medium"
            >
              Jump to Today
            </button>
          )}
        </div>

        {/* Native Date Input for Mobile */}
        <div className="mb-4">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full px-4 py-3 text-base bg-input-background border border-border rounded-xl focus:ring-2 focus:ring-ring focus:border-primary transition-all text-foreground"
          />
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="flex-1 px-3 py-2 bg-muted/60 text-foreground rounded-full hover:bg-secondary transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Week</span>
          </button>
          <button
            type="button"
            onClick={handleNextWeek}
            className="flex-1 px-3 py-2 bg-muted/60 text-foreground rounded-full hover:bg-secondary transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <span>Next Week</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 7-Day Quick Selector - Scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-1 min-w-max">
            {dateOptions.map((date) => {
              const dateObj = new Date(date);
              const isToday = date === getTodayIST();
              const isSelected = date === selectedDate;

              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onDateChange(date)}
                  className={`flex-shrink-0 p-2.5 min-w-[60px] ${dayCellClass(isSelected, isToday)}`}
                >
                  <div className={`text-[10px] uppercase tracking-wide ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-base font-semibold">{dateObj.getDate()}</div>
                  <div className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-primary flex-shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-medium text-foreground">Select Date</h2>
        </div>
        {dateRangeOffset !== 0 && (
          <button
            type="button"
            onClick={jumpToToday}
            className="px-4 py-1.5 bg-secondary text-primary rounded-full hover:opacity-80 transition-opacity text-sm font-medium"
          >
            Jump to Today
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePrevWeek}
          className="w-10 h-10 rounded-full bg-muted/60 text-foreground hover:bg-secondary transition-colors flex items-center justify-center flex-shrink-0"
          title="Previous Week"
        >
          <ChevronLeft className="w-4.5 h-4.5" />
        </button>
        <div className="grid grid-cols-7 gap-2 flex-1">
          {dateOptions.map((date) => {
            const dateObj = new Date(date);
            const isToday = date === getTodayIST();
            const isSelected = date === selectedDate;

            return (
              <button
                key={date}
                type="button"
                onClick={() => onDateChange(date)}
                className={`py-3 ${dayCellClass(isSelected, isToday)}`}
              >
                <div className={`text-[10px] uppercase tracking-wide ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-lg font-semibold mt-0.5">{dateObj.getDate()}</div>
                <div className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleNextWeek}
          className="w-10 h-10 rounded-full bg-muted/60 text-foreground hover:bg-secondary transition-colors flex items-center justify-center flex-shrink-0"
          title="Next Week"
        >
          <ChevronRight className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
});

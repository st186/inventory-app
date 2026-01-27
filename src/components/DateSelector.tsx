import { useState, useMemo, useEffect, memo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

  // Mobile view with native date picker + navigation
  if (isMobile) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-900">Select Date</h2>
          {dateRangeOffset !== 0 && (
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-xs"
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
            className="w-full px-4 py-3 text-base bg-gray-50 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
          />
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={handlePrevWeek}
            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev Week</span>
          </button>
          <button
            type="button"
            onClick={handleNextWeek}
            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <span>Next Week</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 7-Day Quick Selector - Scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-2 min-w-max">
            {dateOptions.map((date) => {
              const dateObj = new Date(date);
              const isToday = date === getTodayIST();
              const isSelected = date === selectedDate;
              
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onDateChange(date)}
                  className={`flex-shrink-0 p-2 rounded-lg text-center transition-all min-w-[60px] ${
                    isSelected
                      ? 'bg-orange-600 text-white shadow-lg'
                      : isToday
                      ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="text-xs uppercase">{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-base font-medium">{dateObj.getDate()}</div>
                  <div className="text-xs">{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
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
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-900">Select Date</h2>
        {dateRangeOffset !== 0 && (
          <button
            type="button"
            onClick={jumpToToday}
            className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm"
          >
            Jump to Today
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePrevWeek}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          title="Previous Week"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm">Prev</span>
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
                className={`p-3 rounded-lg text-center transition-all ${
                  isSelected
                    ? 'bg-orange-600 text-white shadow-lg transform scale-105'
                    : isToday
                    ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="text-xs uppercase">{dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div className="text-lg font-medium">{dateObj.getDate()}</div>
                <div className="text-xs">{dateObj.toLocaleDateString('en-US', { month: 'short' })}</div>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleNextWeek}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          title="Next Week"
        >
          <span className="text-sm">Next</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
});
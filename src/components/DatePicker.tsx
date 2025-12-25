import { ChevronLeft, ChevronRight, Check, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';

type Props = {
  selectedDate: string;
  onDateChange: (date: string) => void;
};

export function DatePicker({ selectedDate, onDateChange }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getDatesArray = (centerDate: string) => {
    const dates = [];
    const center = new Date(centerDate);
    
    // Get 3 days before and 3 days after the selected date (so selected is in center)
    for (let i = -3; i <= 3; i++) {
      const date = new Date(center);
      date.setDate(center.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  const formatDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  };

  const formatDayNumber = (date: Date) => {
    return date.getDate().toString().padStart(2, '0');
  };

  const formatDateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const navigateDays = (offset: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + offset);
    onDateChange(current.toISOString().split('T')[0]);
  };

  const dates = getDatesArray(selectedDate);

  // Mobile-friendly native date picker
  if (isMobile) {
    return (
      <div className="bg-gradient-to-br from-white via-[#F5F3FF] to-[#FFF0F5] rounded-2xl shadow-lg p-4 sm:p-6 border border-[#E6D5FF]">
        <div className="space-y-4">
          {/* Label */}
          <div className="flex items-center justify-between">
            <p className="uppercase tracking-wider text-sm text-gray-700">Pick a Date:</p>
            <Calendar className="w-5 h-5 text-[#9370DB]" />
          </div>

          {/* Native Date Input */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full px-4 py-3 text-base bg-white border-2 border-[#E6D5FF] rounded-xl focus:ring-2 focus:ring-[#9370DB] focus:border-[#9370DB] transition-all shadow-sm"
            />
          </div>

          {/* Quick Navigation Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => navigateDays(-1)}
              className="flex-1 px-4 py-2 bg-white hover:bg-[#E6D5FF] rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 border border-gray-200 hover:border-[#D8BFD8] touch-manipulation"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
              <span className="text-sm">Previous</span>
            </button>
            <button
              onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-[#B0E0E6] to-[#ADD8E6] hover:from-[#9EC5CB] hover:to-[#9CC4CB] text-gray-800 rounded-lg transition-all shadow-sm text-sm border border-[#AEC6CF] touch-manipulation"
            >
              Today
            </button>
            <button
              onClick={() => navigateDays(1)}
              className="flex-1 px-4 py-2 bg-white hover:bg-[#E6D5FF] rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 border border-gray-200 hover:border-[#D8BFD8] touch-manipulation"
            >
              <span className="text-sm">Next</span>
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Selected Date Display */}
          <div className="text-center">
            <div className="inline-block px-4 py-2 bg-gradient-to-r from-[#FFD4E5] to-[#FFC0D9] rounded-full shadow-md border border-[#FFB6D9]">
              <p className="text-sm text-gray-800">
                {formatFullDate(selectedDate)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop custom date picker
  return (
    <div className="bg-gradient-to-br from-white via-[#F5F3FF] to-[#FFF0F5] rounded-2xl shadow-lg p-8 border border-[#E6D5FF]">
      <div className="flex items-center gap-6">
        {/* Label */}
        <div className="flex-shrink-0">
          <p className="uppercase tracking-wider text-gray-700">Pick a Date:</p>
        </div>

        {/* Previous Button */}
        <button
          onClick={() => navigateDays(-1)}
          className="p-3 bg-white hover:bg-[#E6D5FF] rounded-xl transition-all shadow-md hover:shadow-lg flex-shrink-0 group border border-gray-200 hover:border-[#D8BFD8]"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 group-hover:text-[#9370DB] transition-colors" />
        </button>

        {/* Date Cards */}
        <div className="flex gap-3 overflow-x-auto flex-1 scrollbar-hide py-2">
          {dates.map((date) => {
            const dateStr = formatDateString(date);
            const isSelected = dateStr === selectedDate;
            const isTodayDate = isToday(date);

            return (
              <div key={dateStr} className="flex flex-col items-center gap-2">
                <button
                  onClick={() => onDateChange(dateStr)}
                  className={`relative flex flex-col items-center justify-center px-6 py-5 rounded-2xl transition-all min-w-[110px] border-2 ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#FFD4E5] to-[#FFC0D9] text-gray-800 shadow-xl shadow-[#FFB6D9]/30 scale-110 border-[#FFB6D9]'
                      : isTodayDate
                      ? 'bg-gradient-to-br from-[#B0E0E6] to-[#ADD8E6] text-gray-800 shadow-lg shadow-[#AEC6CF]/20 border-[#AEC6CF] hover:scale-105'
                      : 'bg-white text-gray-500 hover:bg-gradient-to-br hover:from-[#F5F5F5] hover:to-[#FAFAFA] hover:text-gray-700 shadow-md hover:shadow-lg border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`text-xs tracking-wider mb-1 ${
                    isSelected || isTodayDate ? 'text-gray-600' : 'text-gray-400'
                  }`}>
                    {formatDayName(date)}
                  </span>
                  <span className={`text-3xl ${
                    isSelected || isTodayDate ? 'text-gray-800' : 'text-gray-700'
                  }`}>
                    {formatDayNumber(date)}
                  </span>
                  
                  {/* Today Badge */}
                  {isTodayDate && !isSelected && (
                    <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-[#FFFACD] text-gray-700 rounded-full text-xs shadow-md border border-[#FFEAA7]">
                      Today
                    </div>
                  )}
                </button>
                
                {/* Checkmark indicator */}
                {isSelected && (
                  <div className="w-10 h-10 bg-gradient-to-br from-[#FFD4E5] to-[#FFC0D9] rounded-full flex items-center justify-center shadow-lg shadow-[#FFB6D9]/40">
                    <Check className="w-6 h-6 text-gray-700" />
                  </div>
                )}
                
                {/* Empty space for alignment when not selected */}
                {!isSelected && <div className="w-10 h-10"></div>}
              </div>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={() => navigateDays(1)}
          className="p-3 bg-white hover:bg-[#E6D5FF] rounded-xl transition-all shadow-md hover:shadow-lg flex-shrink-0 group border border-gray-200 hover:border-[#D8BFD8]"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-[#9370DB] transition-colors" />
        </button>
      </div>

      {/* Selected Date Display */}
      <div className="mt-6 text-center">
        <div className="inline-block px-6 py-3 bg-gradient-to-r from-[#FFD4E5] to-[#FFC0D9] rounded-full shadow-lg shadow-[#FFB6D9]/30 border border-[#FFB6D9]">
          <p className="text-gray-800">
            {formatFullDate(selectedDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

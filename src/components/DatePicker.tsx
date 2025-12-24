import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

type Props = {
  selectedDate: string;
  onDateChange: (date: string) => void;
};

export function DatePicker({ selectedDate, onDateChange }: Props) {
  const getDatesArray = (centerDate: string) => {
    const dates = [];
    const center = new Date(centerDate);
    
    // Get 3 days before and 3 days after the center date
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

  return (
    <div className="bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 rounded-2xl shadow-lg p-8 border border-blue-100">
      <div className="flex items-center gap-6">
        {/* Label */}
        <div className="flex-shrink-0">
          <p className="uppercase tracking-wider text-gray-700">Pick a Date:</p>
        </div>

        {/* Previous Button */}
        <button
          onClick={() => navigateDays(-1)}
          className="p-3 bg-white hover:bg-gradient-to-br hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md hover:shadow-lg flex-shrink-0 group border border-gray-200 hover:border-transparent"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" />
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
                      ? 'bg-gradient-to-br from-orange-400 via-orange-500 to-red-500 text-white shadow-2xl shadow-orange-500/50 scale-110 border-transparent'
                      : isTodayDate
                      ? 'bg-gradient-to-br from-blue-400 to-blue-500 text-white shadow-lg shadow-blue-500/30 border-blue-300 hover:scale-105'
                      : 'bg-white text-gray-500 hover:bg-gradient-to-br hover:from-gray-50 hover:to-gray-100 hover:text-gray-700 shadow-md hover:shadow-lg border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`text-xs tracking-wider mb-1 ${
                    isSelected || isTodayDate ? 'text-white/90' : 'text-gray-400'
                  }`}>
                    {formatDayName(date)}
                  </span>
                  <span className={`text-3xl ${
                    isSelected || isTodayDate ? 'text-white' : 'text-gray-700'
                  }`}>
                    {formatDayNumber(date)}
                  </span>
                  
                  {/* Today Badge */}
                  {isTodayDate && !isSelected && (
                    <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-yellow-400 text-yellow-900 rounded-full text-xs shadow-md">
                      Today
                    </div>
                  )}
                </button>
                
                {/* Checkmark indicator */}
                {isSelected && (
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/40 animate-bounce">
                    <Check className="w-6 h-6 text-white" />
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
          className="p-3 bg-white hover:bg-gradient-to-br hover:from-blue-500 hover:to-purple-500 rounded-xl transition-all shadow-md hover:shadow-lg flex-shrink-0 group border border-gray-200 hover:border-transparent"
        >
          <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Selected Date Display */}
      <div className="mt-6 text-center">
        <div className="inline-block px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-lg shadow-orange-500/30">
          <p className="text-white">
            {formatFullDate(selectedDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

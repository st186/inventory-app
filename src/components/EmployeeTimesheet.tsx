import { useState, useEffect } from 'react';
import { Clock, Calendar, ChevronLeft, ChevronRight, Save, CheckCircle, XCircle, AlertCircle, Copy } from 'lucide-react';
import * as api from '../utils/api';

interface TimesheetEntry {
  id?: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  status: 'pending' | 'approved' | 'rejected';
  isLeave: boolean;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

interface EmployeeTimesheetProps {
  user: {
    employeeId: string;
    name: string;
    email: string;
  };
}

export function EmployeeTimesheet({ user }: EmployeeTimesheetProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()));
  const [mobileDate, setMobileDate] = useState<Date>(new Date());
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaves, setLeaves] = useState<any[]>([]);
  // Signature (startTime|endTime) of each date as last saved to the server, so the
  // Save/Send button only lights up when there's something new to submit - not every
  // time the already-pending entry simply re-renders.
  const [savedSignatures, setSavedSignatures] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTimesheetData();
    loadLeaves();
  }, [currentWeekStart]);

  // Local date string (not toISOString, which converts to UTC and rolls the date back
  // a day for timezones ahead of UTC - e.g. IST local midnight becomes "yesterday" in UTC).
  // This was silently saving timesheet entries under the wrong date.
  function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as week start
    return new Date(d.setDate(diff));
  }

  function getWeekDates(weekStart: Date): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  }

  // Attendance can only be logged for today or earlier, and never for a clock-in/out time
  // that hasn't happened yet today.
  function isFutureDate(date: Date): boolean {
    return getLocalDateString(date) > getLocalDateString(new Date());
  }

  function getCurrentTimeString(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function isFutureTimeToday(date: Date, time: string): boolean {
    if (!time) return false;
    return getLocalDateString(date) === getLocalDateString(new Date()) && time > getCurrentTimeString();
  }

  const loadTimesheetData = async () => {
    try {
      setLoading(true);
      const data = await api.getTimesheets(user.employeeId);
      setTimesheetData(data as any);
      const sigs: Record<string, string> = {};
      (data as any[]).forEach((t) => {
        sigs[t.date] = `${t.startTime}|${t.endTime}`;
      });
      setSavedSignatures(sigs);
    } catch (error) {
      console.error('Error loading timesheet:', error);
    } finally {
      setLoading(false);
    }
  };

  // Only enable the Save/Send button when the entry actually differs from what's
  // already been submitted - once it's pending, re-showing the same values shouldn't
  // look like there's a fresh action to take.
  const isDirty = (entry: TimesheetEntry): boolean => {
    return savedSignatures[entry.date] !== `${entry.startTime}|${entry.endTime}`;
  };

  const loadLeaves = async () => {
    try {
      const leaveData = await api.getLeaves(user.employeeId);
      // Include both approved and pending leaves to block timesheet entry
      setLeaves(leaveData.filter((l: any) => l.status === 'approved' || l.status === 'pending'));
    } catch (error) {
      console.error('Error loading leaves:', error);
    }
  };

  const isOnLeave = (date: Date): boolean => {
    const dateStr = getLocalDateString(date);
    return leaves.some(leave => leave.leaveDate === dateStr);
  };

  const getTimesheetEntry = (date: Date): TimesheetEntry => {
    const dateStr = getLocalDateString(date);
    const existing = timesheetData.find(t => t.date === dateStr);
    
    if (existing) return existing;
    
    return {
      employeeId: user.employeeId,
      date: dateStr,
      startTime: '',
      endTime: '',
      totalHours: 0,
      status: 'pending',
      isLeave: isOnLeave(date)
    };
  };

  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    const diffMinutes = endMinutes - startMinutes;
    return diffMinutes / 60;
  };

  const handleTimeChange = (date: Date, field: 'startTime' | 'endTime', value: string) => {
    const dateStr = getLocalDateString(date);
    const existing = timesheetData.find(t => t.date === dateStr);
    
    let entry: TimesheetEntry;
    if (existing) {
      entry = { ...existing, [field]: value };
    } else {
      entry = {
        employeeId: user.employeeId,
        date: dateStr,
        startTime: field === 'startTime' ? value : '',
        endTime: field === 'endTime' ? value : '',
        totalHours: 0,
        status: 'pending',
        isLeave: false
      };
    }
    
    entry.totalHours = calculateHours(entry.startTime, entry.endTime);
    
    const newData = timesheetData.filter(t => t.date !== dateStr);
    setTimesheetData([...newData, entry]);
  };

  const saveSingleDay = async (date: Date) => {
    const entry = getTimesheetEntry(date);

    if (!entry.startTime || !entry.endTime) {
      alert('Please enter both start and end times');
      return;
    }

    if (isFutureDate(date)) {
      alert('You cannot log attendance for a future date');
      return;
    }

    if (isFutureTimeToday(date, entry.startTime) || isFutureTimeToday(date, entry.endTime)) {
      alert('Time in/out cannot be later than the current time');
      return;
    }

    if (entry.totalHours < 4) {
      alert('For half day, minimum 4 hours required');
      return;
    }

    try {
      setLoading(true);
      await api.saveTimesheet({
        ...entry,
        status: 'pending',
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
      } as any);
      await loadTimesheetData();
      alert('Timesheet saved successfully');
    } catch (error) {
      console.error('Error saving timesheet:', error);
      alert('Error saving timesheet');
    } finally {
      setLoading(false);
    }
  };

  const saveWeek = async () => {
    const weekDates = getWeekDates(currentWeekStart);
    const filled = weekDates
      .map(date => ({ date, entry: getTimesheetEntry(date) }))
      .filter(({ entry }) => entry.startTime && entry.endTime);

    if (filled.length === 0) {
      alert('Please enter timesheet data for at least one day');
      return;
    }

    // Only days edited since the last load go out. Resending every filled day gave pending
    // days new ids (breaking the notification's Approve/Reject buttons and restarting the
    // auto-approve clock) and sent corrected rejected days back still marked rejected.
    const entries = filled.filter(({ entry }) => entry.status !== 'approved' && isDirty(entry));
    if (entries.length === 0) {
      alert('Nothing new to send - every filled day this week is already submitted.');
      return;
    }

    // Validate all entries
    for (const { date, entry } of entries) {
      if (isFutureDate(date)) {
        alert(`${entry.date}: You cannot log attendance for a future date`);
        return;
      }
      if (isFutureTimeToday(date, entry.startTime) || isFutureTimeToday(date, entry.endTime)) {
        alert(`${entry.date}: Time in/out cannot be later than the current time`);
        return;
      }
      if (entry.totalHours < 4) {
        alert(`${entry.date}: Minimum 4 hours required for half day`);
        return;
      }
    }

    // An edited rejected day is a fresh submission: back to pending, old rejection cleared.
    const bulkEntries = entries.map(({ entry }) => ({
      ...entry,
      status: 'pending' as const,
      rejectedBy: undefined,
      rejectedAt: undefined,
      rejectionReason: undefined,
    }));

    try {
      setLoading(true);
      await api.saveTimesheetBulk(bulkEntries);
      await loadTimesheetData();
      alert(`Sent ${bulkEntries.length} day(s) for approval`);
    } catch (error) {
      console.error('Error saving week timesheet:', error);
      alert('Error saving week timesheet');
    } finally {
      setLoading(false);
    }
  };

  const previousDay = () => {
    const newDate = new Date(mobileDate);
    newDate.setDate(newDate.getDate() - 1);
    setMobileDate(newDate);
  };

  const nextDay = () => {
    const newDate = new Date(mobileDate);
    newDate.setDate(newDate.getDate() + 1);
    setMobileDate(newDate);
  };

  const previousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const copyFromPreviousWeek = async () => {
    try {
      setLoading(true);
      
      // Get previous week's dates
      const previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      const previousWeekDates = getWeekDates(previousWeekStart);
      
      // Get previous week's timesheet data
      const allTimesheets = await api.getTimesheets(user.employeeId);
      
      // Filter for previous week's approved or filled entries
      const previousWeekData = previousWeekDates.map(date => {
        const dateStr = getLocalDateString(date);
        return allTimesheets.find((t) => t.date === dateStr);
      }).filter(Boolean);
      
      if (previousWeekData.length === 0) {
        alert('No timesheet data found in previous week to copy');
        setLoading(false);
        return;
      }
      
      // Create new entries for current week based on previous week's data
      const currentWeekDates = getWeekDates(currentWeekStart);
      const newEntries: TimesheetEntry[] = [];
      
      currentWeekDates.forEach((currentDate, index) => {
        const currentDateStr = getLocalDateString(currentDate);
        const previousEntry = previousWeekData[index] as TimesheetEntry;
        
        // Skip if current date already has data, is on leave, or is still in the future
        const existingEntry = timesheetData.find(t => t.date === currentDateStr);
        const onLeave = isOnLeave(currentDate);

        if (!onLeave && !isFutureDate(currentDate) && previousEntry && previousEntry.startTime && previousEntry.endTime) {
          // Only copy over an empty, unsent or rejected day - not an approved one, and not
          // one already submitted and waiting (that would turn it into a new submission).
          if (!existingEntry || existingEntry.status === 'rejected' || (!existingEntry.id && existingEntry.status !== 'approved')) {
            newEntries.push({
              employeeId: user.employeeId,
              date: currentDateStr,
              startTime: previousEntry.startTime,
              endTime: previousEntry.endTime,
              totalHours: previousEntry.totalHours,
              status: 'pending',
              isLeave: false
            });
          }
        }
      });
      
      if (newEntries.length === 0) {
        alert('All days in current week are either on leave or already have approved entries');
        setLoading(false);
        return;
      }
      
      // Update local state to show copied data immediately
      const updatedData = [...timesheetData];
      newEntries.forEach(newEntry => {
        const index = updatedData.findIndex(t => t.date === newEntry.date);
        if (index >= 0) {
          updatedData[index] = newEntry;
        } else {
          updatedData.push(newEntry);
        }
      });
      setTimesheetData(updatedData);
      
      alert(`Copied ${newEntries.length} day(s) from previous week! Don't forget to save.`);
      
    } catch (error) {
      console.error('Error copying from previous week:', error);
      alert('Error copying data from previous week');
    } finally {
      setLoading(false);
    }
  };

  const weekDates = getWeekDates(currentWeekStart);
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-rose-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-8">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">My Timesheet</h1>
            <p className="text-sm sm:text-base text-gray-500">Track your daily working hours</p>
          </div>
        </div>

        {/* Mobile: single-day view */}
        <div className="md:hidden">
          {(() => {
            const entry = getTimesheetEntry(mobileDate);
            const onLeave = isOnLeave(mobileDate);
            const isApproved = entry.status === 'approved';
            // Once submitted, an entry is locked from further edits until the manager
            // rejects it (or it's approved) - it shouldn't be alterable while sitting
            // in someone's approval queue.
            const isLocked = isApproved || (!!entry.id && entry.status === 'pending');
            const isFuture = isFutureDate(mobileDate);
            const maxTime = getLocalDateString(mobileDate) === getLocalDateString(new Date()) ? getCurrentTimeString() : undefined;
            const canSubmit = !isLocked && !isFuture && entry.startTime && entry.endTime && (isDirty(entry) || entry.status === 'rejected');

            return (
              <div className="bg-white rounded-2xl shadow-sm p-4">
                {/* Day Navigator */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={previousDay}
                    aria-label="Previous day"
                    className="w-10 h-10 flex items-center justify-center bg-orange-100 text-orange-700 rounded-full hover:bg-orange-200 transition-colors flex-shrink-0"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="text-center">
                    <p className="text-base text-gray-900">
                      {mobileDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                    <button
                      onClick={() => setMobileDate(new Date())}
                      className="text-xs text-orange-600 mt-0.5"
                    >
                      Jump to today
                    </button>
                  </div>
                  <button
                    onClick={nextDay}
                    aria-label="Next day"
                    disabled={getLocalDateString(mobileDate) >= getLocalDateString(new Date())}
                    className="w-10 h-10 flex items-center justify-center bg-orange-100 text-orange-700 rounded-full hover:bg-orange-200 transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-orange-100"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {onLeave ? (
                  <div className="flex items-center gap-2 justify-center py-8 text-yellow-700 bg-yellow-50 rounded-xl">
                    <AlertCircle className="w-5 h-5" />
                    On leave this day
                  </div>
                ) : isFuture ? (
                  <div className="flex items-center gap-2 justify-center py-8 text-gray-500 bg-gray-50 rounded-xl">
                    <AlertCircle className="w-5 h-5" />
                    Attendance can't be logged for a future date
                  </div>
                ) : (
                  <>
                    {/* Status badge */}
                    <div className="flex justify-center mb-4">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                          <CheckCircle className="w-4 h-4" /> Approved
                        </span>
                      ) : entry.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                          <XCircle className="w-4 h-4" /> Rejected
                        </span>
                      ) : entry.startTime && entry.endTime ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                          <Clock className="w-4 h-4" /> Pending approval
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">
                          Not logged yet
                        </span>
                      )}
                    </div>
                    {entry.status === 'rejected' && entry.rejectionReason && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
                        Reason: {entry.rejectionReason}
                      </p>
                    )}

                    {/* Time inputs */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Time in</label>
                        <input
                          type="time"
                          value={entry.startTime}
                          onChange={(e) => handleTimeChange(mobileDate, 'startTime', e.target.value)}
                          disabled={isLocked}
                          max={maxTime}
                          className="w-full px-3 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1.5">Time out</label>
                        <input
                          type="time"
                          value={entry.endTime}
                          onChange={(e) => handleTimeChange(mobileDate, 'endTime', e.target.value)}
                          disabled={isLocked}
                          max={maxTime}
                          className="w-full px-3 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <p className="text-center text-sm text-gray-600 mb-4">
                      {entry.totalHours > 0 ? (
                        <span className={entry.totalHours >= 4 ? 'text-green-700' : 'text-red-700'}>
                          {entry.totalHours.toFixed(2)} hours
                        </span>
                      ) : (
                        'Enter both times to calculate hours'
                      )}
                    </p>

                    {!isApproved && (
                      <button
                        onClick={() => saveSingleDay(mobileDate)}
                        disabled={loading || !canSubmit}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        <Save className="w-5 h-5" />
                        {entry.status === 'pending' && entry.startTime && entry.endTime && !isDirty(entry)
                          ? 'Pending approval'
                          : entry.status === 'rejected'
                            ? 'Resend for approval'
                            : 'Send for approval'}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Desktop: week view */}
        <div className="hidden md:block">
        {/* Week Navigator */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={previousWeek}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous Week
                </button>
                
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center mb-1">
                    <Calendar className="w-5 h-5 text-orange-600" />
                    <span className="text-lg font-bold text-gray-900">
                      {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' - '}
                      {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">Week View</p>
                </div>
                
                <button
                  onClick={nextWeek}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                >
                  Next Week
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              
              {/* Copy from Previous Week Button */}
              <div className="flex justify-center pt-2 border-t border-gray-200">
                <button
                  onClick={copyFromPreviousWeek}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:from-blue-600 hover:to-cyan-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" />
                  Copy from Previous Week
                </button>
              </div>
            </div>

        {/* Timesheet Grid */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-orange-600 to-red-600 text-white">
                    <tr>
                      <th className="px-6 py-4 text-left">Date</th>
                      <th className="px-6 py-4 text-left">Day</th>
                      <th className="px-6 py-4 text-left">Start Time</th>
                      <th className="px-6 py-4 text-left">End Time</th>
                      <th className="px-6 py-4 text-left">Total Hours</th>
                      <th className="px-6 py-4 text-left">Status</th>
                      <th className="px-6 py-4 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {weekDates.map((date, index) => {
                      const entry = getTimesheetEntry(date);
                      const onLeave = isOnLeave(date);
                      const isFuture = isFutureDate(date);
                      const maxTime = getLocalDateString(date) === getLocalDateString(new Date()) ? getCurrentTimeString() : undefined;
                      // Once submitted, locked from further edits until rejected (or approved)
                      const isLocked = entry.status === 'approved' || (!!entry.id && entry.status === 'pending');
                      const canSubmit = !isLocked && !isFuture && entry.startTime && entry.endTime && (isDirty(entry) || entry.status === 'rejected');

                      return (
                        <tr key={index} className={onLeave ? 'bg-yellow-50' : isFuture ? 'bg-gray-50' : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-6 py-4 text-gray-900">
                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </td>
                          <td className="px-6 py-4">
                            {onLeave ? (
                              <span className="text-yellow-700 text-sm">On Leave</span>
                            ) : isFuture ? (
                              <span className="text-gray-400 text-sm">-</span>
                            ) : (
                              <input
                                type="time"
                                value={entry.startTime}
                                onChange={(e) => handleTimeChange(date, 'startTime', e.target.value)}
                                disabled={isLocked}
                                max={maxTime}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100"
                              />
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {onLeave ? (
                              <span className="text-yellow-700 text-sm">On Leave</span>
                            ) : isFuture ? (
                              <span className="text-gray-400 text-sm">-</span>
                            ) : (
                              <input
                                type="time"
                                value={entry.endTime}
                                onChange={(e) => handleTimeChange(date, 'endTime', e.target.value)}
                                disabled={isLocked}
                                max={maxTime}
                                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100"
                              />
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {onLeave || isFuture ? (
                              <span className="text-yellow-700">-</span>
                            ) : (
                              <span className={`${entry.totalHours >= 4 ? 'text-green-700' : entry.totalHours > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                                {entry.totalHours > 0 ? `${entry.totalHours.toFixed(2)} hrs` : '-'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {onLeave ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                <AlertCircle className="w-4 h-4" />
                                Leave
                              </span>
                            ) : isFuture ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">
                                Upcoming
                              </span>
                            ) : entry.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                                <CheckCircle className="w-4 h-4" />
                                Approved
                              </span>
                            ) : entry.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
                                <XCircle className="w-4 h-4" />
                                Rejected
                              </span>
                            ) : entry.startTime && entry.endTime ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm">
                                <Clock className="w-4 h-4" />
                                Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">
                                <AlertCircle className="w-4 h-4" />
                                Unknown
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {!onLeave && !isFuture && entry.status !== 'approved' && (
                              <button
                                onClick={() => saveSingleDay(date)}
                                disabled={loading || !canSubmit}
                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                              >
                                <Save className="w-4 h-4" />
                                {entry.status === 'pending' && entry.startTime && entry.endTime && !isDirty(entry)
                                  ? 'Pending'
                                  : entry.status === 'rejected'
                                    ? 'Resend'
                                    : 'Save'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

        {/* Save Week Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveWeek}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all shadow-lg disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            Save Entire Week
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

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
  const [timesheetData, setTimesheetData] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaves, setLeaves] = useState<any[]>([]);

  useEffect(() => {
    loadTimesheetData();
    loadLeaves();
  }, [currentWeekStart]);

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

  const loadTimesheetData = async () => {
    try {
      setLoading(true);
      const data = await api.getTimesheets(user.employeeId);
      setTimesheetData(data);
    } catch (error) {
      console.error('Error loading timesheet:', error);
    } finally {
      setLoading(false);
    }
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
    const dateStr = date.toISOString().split('T')[0];
    return leaves.some(leave => leave.leaveDate === dateStr);
  };

  const getTimesheetEntry = (date: Date): TimesheetEntry => {
    const dateStr = date.toISOString().split('T')[0];
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
    const dateStr = date.toISOString().split('T')[0];
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
    
    if (entry.totalHours < 4) {
      alert('For half day, minimum 4 hours required');
      return;
    }
    
    try {
      setLoading(true);
      await api.saveTimesheet(entry);
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
    const entries = weekDates.map(date => getTimesheetEntry(date)).filter(e => e.startTime && e.endTime);
    
    if (entries.length === 0) {
      alert('Please enter timesheet data for at least one day');
      return;
    }
    
    // Validate all entries
    for (const entry of entries) {
      if (entry.totalHours < 4) {
        alert(`${entry.date}: Minimum 4 hours required for half day`);
        return;
      }
    }
    
    try {
      setLoading(true);
      await api.saveTimesheetBulk(entries);
      await loadTimesheetData();
      alert('Week timesheet saved successfully');
    } catch (error) {
      console.error('Error saving week timesheet:', error);
      alert('Error saving week timesheet');
    } finally {
      setLoading(false);
    }
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
        const dateStr = date.toISOString().split('T')[0];
        return allTimesheets.find((t: TimesheetEntry) => t.date === dateStr);
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
        const currentDateStr = currentDate.toISOString().split('T')[0];
        const previousEntry = previousWeekData[index] as TimesheetEntry;
        
        // Skip if current date already has data or is on leave
        const existingEntry = timesheetData.find(t => t.date === currentDateStr);
        const onLeave = isOnLeave(currentDate);
        
        if (!onLeave && previousEntry && previousEntry.startTime && previousEntry.endTime) {
          // Only copy if current date doesn't have approved data
          if (!existingEntry || existingEntry.status !== 'approved') {
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 mb-2">My Timesheet</h1>
          <p className="text-gray-600">Track your daily working hours</p>
        </div>

        {/* Week Navigator */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={previousWeek}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous Week
            </button>
            
            <div className="text-center">
              <div className="flex items-center gap-2 justify-center mb-1">
                <Calendar className="w-5 h-5 text-purple-600" />
                <span className="text-lg text-gray-900">
                  {currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' - '}
                  {weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <p className="text-sm text-gray-600">Week View</p>
            </div>
            
            <button
              onClick={nextWeek}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
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
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
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
                  
                  return (
                    <tr key={index} className={onLeave ? 'bg-yellow-50' : index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 text-gray-900">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </td>
                      <td className="px-6 py-4">
                        {onLeave ? (
                          <span className="text-yellow-700 text-sm">On Leave</span>
                        ) : (
                          <input
                            type="time"
                            value={entry.startTime}
                            onChange={(e) => handleTimeChange(date, 'startTime', e.target.value)}
                            disabled={entry.status === 'approved'}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {onLeave ? (
                          <span className="text-yellow-700 text-sm">On Leave</span>
                        ) : (
                          <input
                            type="time"
                            value={entry.endTime}
                            onChange={(e) => handleTimeChange(date, 'endTime', e.target.value)}
                            disabled={entry.status === 'approved'}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {onLeave ? (
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
                          <span className="text-gray-400 text-sm">Not filled</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {!onLeave && entry.status !== 'approved' && (
                          <button
                            onClick={() => saveSingleDay(date)}
                            disabled={loading || !entry.startTime || !entry.endTime}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                          >
                            <Save className="w-4 h-4" />
                            Save
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
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            Save Entire Week
          </button>
        </div>
      </div>
    </div>
  );
}
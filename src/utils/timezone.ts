/**
 * Timezone Utility Module for IST (GMT+5:30)
 * Handles all date/time operations consistently across the application
 */

// IST offset is +5 hours and 30 minutes from UTC
const IST_OFFSET_HOURS = 5;
const IST_OFFSET_MINUTES = 30;
const IST_OFFSET_MS = (IST_OFFSET_HOURS * 60 + IST_OFFSET_MINUTES) * 60 * 1000;

/**
 * Get current date/time in IST
 * @returns ISO string in IST timezone
 */
export function getNowIST(): string {
  const now = new Date();
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  return istTime.toISOString();
}

/**
 * Get current date in IST (YYYY-MM-DD format)
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayIST(): string {
  return getNowIST().substring(0, 10);
}

/**
 * Convert UTC timestamp to IST timestamp
 * @param utcTimestamp - ISO string in UTC
 * @returns ISO string in IST
 */
export function utcToIST(utcTimestamp: string): string {
  const utcDate = new Date(utcTimestamp);
  const istTime = new Date(utcDate.getTime() + IST_OFFSET_MS);
  return istTime.toISOString();
}

/**
 * Convert IST timestamp to UTC timestamp
 * @param istTimestamp - ISO string representing IST time
 * @returns ISO string in UTC
 */
export function istToUTC(istTimestamp: string): string {
  const istDate = new Date(istTimestamp);
  const utcTime = new Date(istDate.getTime() - IST_OFFSET_MS);
  return utcTime.toISOString();
}

/**
 * Format date/time for display in IST
 * @param timestamp - ISO string (can be UTC or IST)
 * @param isUTC - whether the input is UTC (default: true)
 * @returns Formatted string like "15 Jan 2026, 3:49 AM IST"
 */
export function formatDateTimeIST(timestamp: string, isUTC: boolean = true): string {
  if (!timestamp) return 'Invalid Date';
  
  try {
    const date = isUTC ? new Date(new Date(timestamp).getTime() + IST_OFFSET_MS) : new Date(timestamp);
    
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    const day = date.getUTCDate();
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = date.getUTCFullYear();
    
    let hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    
    const minutesStr = minutes.toString().padStart(2, '0');
    
    return `${day} ${month} ${year}, ${hours}:${minutesStr} ${ampm} IST`;
  } catch (error) {
    return 'Invalid Date';
  }
}

/**
 * Format date for display (without time)
 * @param dateStr - Date string (YYYY-MM-DD) or ISO timestamp
 * @returns Formatted string like "15 Jan 2026"
 */
export function formatDateIST(dateStr: string): string {
  if (!dateStr) return 'Invalid Date';
  
  // Handle ISO timestamps by extracting just the date part
  const datePart = dateStr.substring(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  
  // Validate the extracted values
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    return 'Invalid Date';
  }
  
  const date = new Date(Date.UTC(year, month - 1, day));
  
  const monthStr = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  
  return `${day} ${monthStr} ${year}`;
}

/**
 * Get date object in IST
 * @returns Date object adjusted to IST
 */
export function getDateIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/**
 * Compare two dates (ignoring time)
 * @param date1 - First date string (YYYY-MM-DD or ISO)
 * @param date2 - Second date string (YYYY-MM-DD or ISO)
 * @returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export function compareDates(date1: string, date2: string): number {
  const d1 = date1.substring(0, 10);
  const d2 = date2.substring(0, 10);
  
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Check if a date is today in IST
 * @param dateStr - Date string (YYYY-MM-DD or ISO)
 * @returns true if the date is today in IST
 */
export function isToday(dateStr: string): boolean {
  const today = getTodayIST();
  const checkDate = dateStr.substring(0, 10);
  return today === checkDate;
}

/**
 * Get start of month in IST (YYYY-MM-01)
 * @param date - Optional date string, defaults to current month
 * @returns Date string in YYYY-MM-01 format
 */
export function getStartOfMonthIST(date?: string): string {
  const baseDate = date ? date : getTodayIST();
  return baseDate.substring(0, 8) + '01';
}

/**
 * Get end of month in IST (YYYY-MM-DD)
 * @param date - Optional date string, defaults to current month
 * @returns Date string in YYYY-MM-DD format (last day of month)
 */
export function getEndOfMonthIST(date?: string): string {
  const baseDate = date ? date : getTodayIST();
  const [year, month] = baseDate.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
}

/**
 * Add days to a date
 * @param dateStr - Date string (YYYY-MM-DD)
 * @param days - Number of days to add (can be negative)
 * @returns New date string in YYYY-MM-DD format
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  
  const newYear = date.getUTCFullYear();
  const newMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const newDay = date.getUTCDate().toString().padStart(2, '0');
  
  return `${newYear}-${newMonth}-${newDay}`;
}

/**
 * Get day of month in IST
 * @param timestamp - Optional ISO timestamp, defaults to now
 * @returns Day of month (1-31)
 */
export function getDayOfMonthIST(timestamp?: string): number {
  const date = timestamp ? utcToIST(timestamp) : getNowIST();
  return parseInt(date.substring(8, 10), 10);
}

/**
 * Format timestamp for backend storage (always in IST)
 * @returns ISO timestamp adjusted to IST
 */
export function getTimestampForStorage(): string {
  return getNowIST();
}
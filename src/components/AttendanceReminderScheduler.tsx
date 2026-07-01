import { useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

/**
 * Background scheduler component that triggers attendance/timesheet reminders
 * once a day (during the 11am hour, targeting the 11:59am deadline). Sends a
 * reminder to any employee/manager who hasn't filled their timesheet for one
 * or more of the trailing 5 days.
 */
export function AttendanceReminderScheduler() {
  const lastReminderDateRef = useRef<string>('');
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('📅 Attendance Reminder Scheduler initialized');

    const checkAndSendReminders = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split('T')[0];

      // Only send reminders during the 11am hour (deadline: 11:59am), once per day
      if (currentHour === 11 && lastReminderDateRef.current !== currentDate) {
        console.log('⏰ 11am - Time to send attendance reminders!');

        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/send-attendance-reminders`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.ok) {
            const result = await response.json();
            console.log('✅ Attendance reminders sent successfully:', result);
            lastReminderDateRef.current = currentDate;
          } else {
            console.error('❌ Failed to send attendance reminders:', response.statusText);
          }
        } catch (error) {
          console.error('❌ Error sending attendance reminders:', error);
        }
      }
    };

    // Check every 15 minutes to catch the 11am window
    checkIntervalRef.current = setInterval(checkAndSendReminders, 15 * 60 * 1000);

    // Also check immediately on mount
    checkAndSendReminders();

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  // This component doesn't render anything visible
  return null;
}

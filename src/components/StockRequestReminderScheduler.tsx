import { useEffect, useRef } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

/**
 * Background scheduler component that triggers stock request reminders at 3pm daily
 * This component runs in the background and sends reminders to Store Incharges
 * who haven't submitted their stock requests by 3pm.
 */
export function StockRequestReminderScheduler() {
  const lastReminderDateRef = useRef<string>('');
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('📅 Stock Request Reminder Scheduler initialized');

    const checkAndSendReminders = async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toISOString().split('T')[0];

      // Only send reminders at 3pm (15:00) and only once per day
      if (currentHour === 15 && lastReminderDateRef.current !== currentDate) {
        console.log('⏰ 3PM - Time to send stock request reminders!');
        
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/send-stock-request-reminders`,
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
            console.log('✅ Stock request reminders sent successfully:', result);
            lastReminderDateRef.current = currentDate;
          } else {
            console.error('❌ Failed to send stock request reminders:', response.statusText);
          }
        } catch (error) {
          console.error('❌ Error sending stock request reminders:', error);
        }
      }
    };

    // Check every 15 minutes (900000 ms) to catch the 3pm window
    checkIntervalRef.current = setInterval(checkAndSendReminders, 15 * 60 * 1000);

    // Also check immediately on mount
    checkAndSendReminders();

    // Cleanup on unmount
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, []);

  // This component doesn't render anything visible
  return null;
}

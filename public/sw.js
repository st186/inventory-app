// Service Worker for Push Notifications
// This runs in the background and handles push events

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let notificationData = {
    title: 'Bhandar-IMS',
    body: 'You have a new notification',
    icon: '/icon-192x192.png', // You can add your app icon here
    badge: '/badge-72x72.png',
    tag: 'bhandar-notification',
    requireInteraction: false,
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.message || data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        tag: data.tag || notificationData.tag,
        data: data, // Store full data for click handling
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
    })
  );
});

// Build the deep-link target for a notification based on its type/relatedId.
// Keep this in sync with the "type" values used in the backend's notifyUser() calls.
// Valid "view" values must match App.tsx's activeView union type; "tab" (where
// present) must match the target component's own internal tab identifiers
// (e.g. AttendancePortal.tsx's activeTab values).
const NOTIFICATION_VIEW_MAP = {
  inventory_logged: { view: 'inventory' },
  sales_logged: { view: 'sales' },
  discrepancy_request: { view: 'sales' },
  discrepancy_approved: { view: 'sales' },
  discrepancy_rejected: { view: 'sales' },
  production_pending: { view: 'production' },
  production_approved: { view: 'production' },
  // Attendance: the recipient of "*_pending" is the approver, so they land on
  // the approval tab; the recipient of "*_approved/rejected" is the employee
  // who submitted it, so they land on their own timesheet/leave tab.
  timesheet_pending: { view: 'attendance', tab: 'approve-timesheet' },
  timesheet_approved: { view: 'attendance', tab: 'timesheet' },
  timesheet_rejected: { view: 'attendance', tab: 'timesheet' },
  leave_pending: { view: 'attendance', tab: 'approve-leave' },
  leave_approved: { view: 'attendance', tab: 'leave' },
  leave_rejected: { view: 'attendance', tab: 'leave' },
  attendance_reminder: { view: 'attendance', tab: 'timesheet' },
  stock_request_new: { view: 'stock-requests' },
  stock_request_delayed: { view: 'analytics' }, // tracks production requests, not stock requests, despite the name
  stock_recalibration: { view: 'analytics' },
  fulfillment_reminder: { view: 'stock-requests' }, // covers both stock + production requests; lands on the fulfillment screen
  data_entry_reminder: { view: 'inventory' }, // covers both inventory + sales reminders
};

function getNavigationTarget(data) {
  if (!data || !data.type) return null;

  // Production requests always carry a specific request to highlight/scroll to
  if (data.type.startsWith('production_request_') && data.relatedId) {
    return { view: 'analytics', highlightRequestId: data.relatedId };
  }
  if (data.type === 'stock_request_new' && data.relatedId) {
    return { view: 'stock-requests', highlightRequestId: data.relatedId };
  }

  const mapped = NOTIFICATION_VIEW_MAP[data.type];
  if (mapped) {
    return { view: mapped.view, tab: mapped.tab, highlightRequestId: data.relatedId || undefined };
  }
  return null;
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  const target = getNavigationTarget(event.notification.data);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open in some tab, focus it and tell it where to navigate
      for (const client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          if (target && 'postMessage' in client) {
            client.postMessage({ type: 'notification-navigate', target });
          }
          return client.focus();
        }
      }
      // Otherwise open a new window, passing the target as query params
      if (clients.openWindow) {
        if (target) {
          const params = new URLSearchParams({ view: target.view });
          if (target.tab) {
            params.set('tab', target.tab);
          }
          if (target.highlightRequestId) {
            params.set('highlightRequestId', target.highlightRequestId);
          }
          return clients.openWindow(`/?${params.toString()}`);
        }
        return clients.openWindow('/');
      }
    })
  );
});

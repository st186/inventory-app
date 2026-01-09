import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import * as api from '../utils/api';

type NotificationsProps = {
  onNavigate?: (path: string, date?: string, requestId?: string) => void;
};

export function Notifications({ onNavigate }: NotificationsProps) {
  const [notifications, setNotifications] = useState<api.Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
    
    // Refresh notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch (error) {
      // Silently handle all errors - notifications are non-critical
      // Common errors: user not logged in, network issues, server errors
      setNotifications([]);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    setLoading(true);
    try {
      await api.markAllNotificationsAsRead();
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = (notification: api.Notification) => {
    // Mark as read
    if (!notification.read) {
      handleMarkAsRead(notification.id);
    }

    // Navigate based on notification type
    if (onNavigate) {
      switch (notification.type) {
        case 'sales_pending':
        case 'sales_approved':
        case 'sales_rejected':
        case 'discrepancy_request':
        case 'discrepancy_approved':
        case 'discrepancy_rejected':
          onNavigate('sales', notification.relatedDate || undefined);
          break;
        case 'timesheet_pending':
        case 'timesheet_approved':
        case 'timesheet_rejected':
          onNavigate('attendance');
          break;
        case 'leave_pending':
        case 'leave_approved':
        case 'leave_rejected':
          onNavigate('leave');
          break;
        case 'production_pending':
        case 'production_approved':
          onNavigate('production', notification.relatedDate || undefined);
          break;
        // Production Request workflow notifications
        case 'production_request_new':
        case 'production_request_accepted':
        case 'production_request_in-preparation':
        case 'production_request_prepared':
        case 'production_request_shipped':
        case 'production_request_delivered':
          onNavigate('production-requests', notification.relatedDate || undefined, notification.relatedId || undefined);
          break;
        // Stock Request notifications
        case 'stock_request_new':
        case 'stock_request_fulfilled':
        case 'stock_request_partial':
        case 'stock_request_cancelled':
          onNavigate('stock-requests', notification.relatedDate || undefined, notification.relatedId || undefined);
          break;
        // Delayed pending request notifications
        case 'stock_request_delayed':
          onNavigate('production-requests', notification.relatedDate || undefined, notification.relatedId || undefined);
          break;
      }
    }

    setIsOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    if (type.includes('approved')) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else if (type.includes('rejected')) {
      return <X className="w-5 h-5 text-red-600" />;
    } else if (type.includes('pending') || type.includes('request')) {
      return <Clock className="w-5 h-5 text-orange-600" />;
    } else if (type.includes('logged')) {
      return <CheckCircle className="w-5 h-5 text-blue-600" />;
    }
    return <AlertTriangle className="w-5 h-5 text-blue-600" />;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white hover:bg-white/20 rounded-full transition-all backdrop-blur-sm border border-white/30"
        aria-label="Notifications"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full animate-pulse shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Notification Panel */}
          <div className="fixed md:absolute left-4 right-4 md:left-auto md:right-0 mt-2 md:w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[80vh] md:max-h-[600px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-gray-900">Notifications</h3>
                {unreadCount > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {unreadCount} unread
                  </p>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={loading}
                  className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                        !notification.read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatTimestamp(notification.createdAt)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="flex-shrink-0">
                            <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}
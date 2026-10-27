import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';
import { getNavigationTarget } from '../utils/notificationNavigation';
import { isNativePushSupported } from '../utils/nativePushNotifications';
import { useForegroundInterval } from '../utils/appVisibility';

type NotificationsProps = {
 // Mirrors the push-notification deep-link shape (see notificationNavigation.ts /
 // App.tsx's applyNavigationTarget) so a bell click and a push-notification tap
 // land on exactly the same place.
 onNavigate?: (view: string, tab?: string, highlightRequestId?: string) => void;
};

// The Android app already delivers every notification as a real system push (see
// nativePushNotifications.ts) with its own tray, tap-to-open, and (for approvals) inline
// action buttons - a second in-app bell/dropdown showing the same list is redundant there
// and was only ever meant for the web app, where there's no OS notification tray to lean
// on. Rendering nothing here (rather than just hiding the badge) also skips the poll
// entirely on native, since nothing on that platform reads it.
const HIDE_ON_NATIVE = isNativePushSupported();

// Web only: how often the bell re-checks while the tab is open and in front. A tab left in the
// background used to keep polling every 30 seconds all day (659 calls in 9 hours from the
// owner's account); now it stops while hidden and catches up on return if it has been a while.
const POLL_MS = 60000;
const RESUME_REFRESH_MS = 15000;

export function Notifications({ onNavigate }: NotificationsProps) {
 const [notifications, setNotifications] = useState<api.Notification[]>([]);
 // Honest total unread count from the server (the full backlog, not just the 100 most
 // recent notifications shown in the list below) - see GET /notifications. Without this,
 // a user with more than 100 unread notifications would see "100 unread" forever, even
 // right after successfully clearing everything, because the badge was being derived
 // from the same capped list that's shown in the dropdown.
 const [unreadCount, setUnreadCount] = useState(0);
 const [isOpen, setIsOpen] = useState(false);
 const [loading, setLoading] = useState(false);

 useEffect(() => {
 // Nothing on native ever reads this component's own state (it renders null below),
 // so skip the fetch and the poll entirely rather than doing pointless work in the
 // background on every screen.
 if (HIDE_ON_NATIVE) return;

 loadNotifications();
 }, []);

 // Refresh every minute while the page is in front; paused while it's hidden.
 useForegroundInterval(() => { loadNotifications(); }, HIDE_ON_NATIVE ? null : POLL_MS, { resumeAfterMs: RESUME_REFRESH_MS });

 const loadNotifications = async () => {
 try {
 const { notifications: data, unreadCount: count } = await api.getNotifications();
 setNotifications(data);
 setUnreadCount(count);
 } catch (error) {
 // Silently handle all errors - notifications are non-critical
 // Common errors: user not logged in, network issues, server errors
 setNotifications([]);
 setUnreadCount(0);
 }
 };

 const handleMarkAsRead = async (id: string) => {
 try {
 await api.markNotificationAsRead(id);
 setNotifications(notifications.map(n =>
 n.id === id ? { ...n, read: true } : n
 ));
 setUnreadCount((c) => Math.max(0, c - 1));
 } catch (error) {
 console.error('Error marking notification as read:', error);
 }
 };

 const handleMarkAllAsRead = async () => {
 setLoading(true);
 try {
 await api.markAllNotificationsAsRead();
 setNotifications(notifications.map(n => ({ ...n, read: true })));
 setUnreadCount(0);
 toast.success('All notifications marked as read.');
 } catch (error) {
 console.error('Error marking all as read:', error);
 // Previously silent - a failed request (auth hiccup, slow network on a large
 // backlog) looked identical to a successful one from the user's side, since nothing
 // told them it didn't work. Surface it so "still shows unread" has an explanation.
 toast.error('Could not mark all as read - check your connection and try again.');
 } finally {
 setLoading(false);
 }
 };

 const handleNotificationClick = (notification: api.Notification) => {
 // Mark as read
 if (!notification.read) {
 handleMarkAsRead(notification.id);
 }

 // Navigate based on notification type - uses the same resolver as push notifications
 // so a bell click and a push-notification tap always land on the same place.
 if (onNavigate) {
 const target = getNavigationTarget({
 type: notification.type,
 relatedId: notification.relatedId,
 });
 if (target) {
 onNavigate(target.view, target.tab, target.highlightRequestId);
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

 if (HIDE_ON_NATIVE) return null;

 return (
 <div className="relative">
 {/* Bell Icon Button */}
 <button
 onClick={() => setIsOpen(!isOpen)}
 className="relative p-2 text-white hover:bg-white/20 rounded-full transition-all border border-white/30"
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
 <div className="fixed md:absolute left-4 right-4 md:left-auto md:right-0 mt-2 md:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 max-h-[80vh] md:max-h-[600px] flex flex-col overflow-hidden">
 {/* Header */}
 <div className="flex items-center justify-between p-4 border-b border-gray-200">
 <div>
 <h3 className="font-bold text-gray-900 tracking-tight">Notifications</h3>
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
 className="text-sm text-orange-600 hover:text-orange-700 disabled:opacity-50 font-medium"
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
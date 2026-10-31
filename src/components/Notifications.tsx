// The notification list behind the bell, on every platform (the Android app used to hide it and
// rely on the system tray only). One shared feed: the top bar's unread count and the Inbox page
// read the same list, so a notification marked read in one place clears everywhere.
//
// Refreshed every minute while the app is in front (two on the Android app, where the system
// tray already announces each one), paused while hidden, and caught up on return.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Bell, Bike, Camera, CheckCircle2, Clock, Package, Wallet, XCircle } from 'lucide-react';
import * as api from '../utils/api';
import { useForegroundInterval } from '../utils/appVisibility';
import { isNativePushSupported } from '../utils/nativePushNotifications';
import type { IconWellTone } from './ui/list-row';
import type { I18nKey, I18nVars } from '../utils/i18n';

export type NotificationsSource = {
  list: () => Promise<{ notifications: api.Notification[]; unreadCount: number }>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
};

export const apiNotificationsSource: NotificationsSource = {
  list: () => api.getNotifications(),
  markRead: (id) => api.markNotificationAsRead(id),
  markAllRead: () => api.markAllNotificationsAsRead(),
};

export type NotificationsFeed = {
  items: api.Notification[];
  /** The server's honest total (the list holds the latest 100). */
  unreadCount: number;
  status: 'loading' | 'ready' | 'error';
  refresh: () => Promise<void>;
  markRead: (id: string) => void;
  /** Resolves false when the server refused (the caller shows a toast). */
  markAllRead: () => Promise<boolean>;
};

const FeedContext = createContext<NotificationsFeed | null>(null);

const POLL_MS = isNativePushSupported() ? 120_000 : 60_000;
const RESUME_REFRESH_MS = 15_000;

export function NotificationsProvider({ source, children }: { source: NotificationsSource; children?: ReactNode }) {
  const [items, setItems] = useState<api.Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<NotificationsFeed['status']>('loading');
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const hasLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { notifications, unreadCount: count } = await sourceRef.current.list();
      setItems(notifications);
      setUnreadCount(count);
      setStatus('ready');
      hasLoaded.current = true;
    } catch {
      // Not critical: keep what is on screen; show the error only if nothing ever loaded.
      if (!hasLoaded.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, source]);
  useForegroundInterval(() => { refresh(); }, POLL_MS, { resumeAfterMs: RESUME_REFRESH_MS });

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const markRead = useCallback((id: string) => {
    const wasUnread = itemsRef.current.some((n) => n.id === id && !n.read);
    if (!wasUnread) return;
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    sourceRef.current.markRead(id).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await sourceRef.current.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo(() => ({ items, unreadCount, status, refresh, markRead, markAllRead }), [items, unreadCount, status, refresh, markRead, markAllRead]);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useNotifications(): NotificationsFeed {
  const feed = useContext(FeedContext);
  if (!feed) throw new Error('useNotifications() outside NotificationsProvider');
  return feed;
}

/** Icon and well tone by kind; colour only where the icon is the status. */
export function notificationLook(type: string, category?: string): { icon: LucideIcon; tone: IconWellTone } {
  if (category === 'urgent' || type === 'workplace_alarm' || type === 'repair_alert' || type === 'escalation') return { icon: AlertTriangle, tone: 'danger' };
  if (type.endsWith('_approved') || type === 'salary_credited' || type.endsWith('_fulfilled') || type === 'kpi_ready') return { icon: CheckCircle2, tone: 'success' };
  if (type.endsWith('_rejected') || type.endsWith('_cancelled') || type === 'backup_failed') return { icon: XCircle, tone: 'danger' };
  if (type === 'stock_out' || type === 'low_stock_alert' || type === 'eod_data_alert' || type === 'burger_check' || type.includes('discrepancy') || type === 'workplace_missed' || type === 'workplace_flag') return { icon: AlertTriangle, tone: 'warning' };
  if (type.startsWith('rider_')) return { icon: Bike, tone: 'neutral' };
  if (type.startsWith('workplace_')) return { icon: Camera, tone: 'neutral' };
  if (type.includes('request') || type.startsWith('production') || type.startsWith('delivery') || type.includes('stock')) return { icon: Package, tone: 'neutral' };
  if (type.startsWith('sales') || type.includes('cash') || type.includes('loan') || type.includes('paytm') || type === 'inventory_logged') return { icon: Wallet, tone: 'neutral' };
  if (type.includes('pending') || type.includes('reminder') || type.includes('expiring')) return { icon: Clock, tone: 'neutral' };
  return { icon: Bell, tone: 'neutral' };
}

type Translate = (key: I18nKey, vars?: I18nVars) => string;

/** "Just now", "12 min ago", "3 h ago", then "Mon 27 Oct". */
export function formatNotificationTime(timestamp: string, t: Translate, now = Date.now()): string {
  const at = new Date(timestamp).getTime();
  if (!Number.isFinite(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t('inbox.justNow');
  if (minutes < 60) return t('inbox.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && new Date(at).toDateString() === new Date(now).toDateString()) return t('inbox.hoursAgo', { n: hours });
  const d = new Date(at);
  return `${t(`date.wd.${d.getDay()}` as I18nKey)} ${d.getDate()} ${t(`date.ms.${d.getMonth()}` as I18nKey)}`;
}

/** Splits the list into today's and earlier notifications (the phone's own day). */
export function groupByDay(items: api.Notification[], now = Date.now()) {
  const today = new Date(now).toDateString();
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return {
    today: sorted.filter((n) => new Date(n.createdAt).toDateString() === today),
    earlier: sorted.filter((n) => new Date(n.createdAt).toDateString() !== today),
  };
}

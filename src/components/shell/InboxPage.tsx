// The Inbox behind the bell, on every platform including the Android app: notifications grouped
// Today / Earlier, newest first; tapping one marks it read and opens its screen (the same
// resolver as a push tap); "Mark all read" in the header.
import { useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { ListGroup, ListRow, IconWell } from '../ui/list-row';
import { Button } from '../ui/button';
import { toast } from '../ui/sonner';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { SkeletonListRows } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import type * as api from '../../utils/api';
import { formatNotificationTime, groupByDay, notificationLook, useNotifications } from '../Notifications';
import { getNavigationTarget, type NotificationNavigationTarget } from '../../utils/notificationNavigation';

export function InboxPage({ onOpenTarget }: { onOpenTarget: (target: NotificationNavigationTarget) => void }) {
  const { t, lang } = useT();
  const feed = useNotifications();
  const [marking, setMarking] = useState(false);
  const { today, earlier } = groupByDay(feed.items);

  const open = (n: api.Notification) => {
    feed.markRead(n.id);
    const target = getNavigationTarget({ type: n.type, relatedId: n.relatedId });
    if (target) onOpenTarget(target);
  };

  const row = (n: api.Notification) => {
    const look = notificationLook(n.type);
    return (
      <ListRow
        key={n.id}
        leading={<IconWell icon={look.icon} tone={look.tone} />}
        title={<span className={cn(!n.read ? 'font-semibold' : 'font-medium text-text-2')}>{n.title}</span>}
        subtitle={n.message || undefined}
        trailing={
          <span className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
            <span className="num text-caption whitespace-nowrap text-text-3">{formatNotificationTime(n.createdAt, t)}</span>
            {!n.read && <span className="size-2.5 rounded-full bg-primary" role="img" aria-label={t('inbox.unread', { n: 1 })} />}
          </span>
        }
        chevron={!!getNavigationTarget({ type: n.type, relatedId: n.relatedId })}
        onClick={() => open(n)}
      />
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-4 lg:px-8 lg:py-6" lang={lang}>
      {feed.status === 'loading' && feed.items.length === 0 ? (
        <SkeletonListRows count={6} />
      ) : feed.status === 'error' ? (
        <ErrorState onRetry={() => feed.refresh()} />
      ) : feed.items.length === 0 ? (
        <EmptyState icon={BellOff} title={t('inbox.empty')} body={t('inbox.emptyBody')} />
      ) : (
        <>
          <div className="-mb-2 flex min-h-11 items-center justify-between gap-3 px-1">
            <span className="num text-body-sm text-text-2">{feed.unreadCount > 0 ? t('inbox.unread', { n: feed.unreadCount }) : t('empty.allCaughtUp')}</span>
            {feed.unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                leadingIcon={<CheckCheck aria-hidden="true" />}
                loading={marking}
                onClick={async () => {
                  setMarking(true);
                  const ok = await feed.markAllRead();
                  setMarking(false);
                  if (ok) toast.success(t('inbox.allRead'));
                  else toast.error(t('inbox.markFailed'));
                }}
              >
                {t('inbox.markAllRead')}
              </Button>
            )}
          </div>
          {today.length > 0 && <ListGroup overline={t('date.today')}>{today.map(row)}</ListGroup>}
          {earlier.length > 0 && <ListGroup overline={t('inbox.earlier')}>{earlier.map(row)}</ListGroup>}
        </>
      )}
    </div>
  );
}

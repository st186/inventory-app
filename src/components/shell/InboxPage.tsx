// The Inbox behind the bell, on every platform including the Android app: notifications grouped
// Today / Earlier, newest first; tapping one marks it read and opens its screen (the same
// resolver as a push tap); "Mark all read" in the header.
import { BellOff } from 'lucide-react';
import { ListGroup, ListRow, IconWell } from '../ui/list-row';
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
        subtitle={
          <>
            {n.message && <span className="block">{n.message}</span>}
            <span className="num block text-caption text-text-3">{formatNotificationTime(n.createdAt, t)}</span>
          </>
        }
        trailing={!n.read ? <span className="size-2.5 shrink-0 rounded-full bg-primary" role="img" aria-label="Unread" /> : undefined}
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
          {today.length > 0 && <ListGroup overline={t('date.today')}>{today.map(row)}</ListGroup>}
          {earlier.length > 0 && <ListGroup overline={t('inbox.earlier')}>{earlier.map(row)}</ListGroup>}
        </>
      )}
    </div>
  );
}

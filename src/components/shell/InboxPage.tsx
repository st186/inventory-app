// The Inbox behind the bell, on every platform including the Android app (owner, 28 Oct 2026:
// notifications brought up to date). Filters by kind - Needs action, Alerts, Reminders, Updates -
// with unread counts; urgent ones in red; a bundle ("Inventory logged +3 more") shows the earlier
// messages; leave and timesheet requests are approved or rejected right here; anything already
// handled by someone else shows as done ("Approved by the store incharge"). Tapping a row marks it read and
// opens its screen (the same resolver as a push tap). The gear opens the settings: quiet hours,
// which kinds buzz, the evening digest, and a test notification. Rules: utils/notificationRules.ts.
import { useEffect, useMemo, useState } from 'react';
import { BellOff, CheckCheck, CheckCircle2, Settings2, X } from 'lucide-react';
import { ListGroup, ListRow, IconWell } from '../ui/list-row';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import * as api from '../../utils/api';
import { BENGALI_TITLE, notificationCategory, type NotificationCategory } from '../../utils/notificationRules';
import { formatNotificationTime, groupByDay, notificationLook, useNotifications } from '../Notifications';
import { getNavigationTarget, type NotificationNavigationTarget } from '../../utils/notificationNavigation';
import { useShell } from './ShellContext';

type Filter = 'all' | NotificationCategory;
const FILTERS: { key: Filter; label: I18nKey }[] = [
  { key: 'all', label: 'inbox.f.all' },
  { key: 'action', label: 'inbox.f.action' },
  { key: 'urgent', label: 'inbox.f.urgent' },
  { key: 'reminder', label: 'inbox.f.reminder' },
  { key: 'update', label: 'inbox.f.update' },
];
const categoryOf = (n: api.Notification): NotificationCategory => n.category || notificationCategory(n.type);
// Approve / reject right in the inbox for these.
const INLINE = new Set(['leave_pending', 'timesheet_pending']);

export function InboxPage({ onOpenTarget }: { onOpenTarget: (target: NotificationNavigationTarget) => void }) {
  const { t, lang } = useT();
  const { user } = useShell();
  const feed = useNotifications();
  const [marking, setMarking] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [doneHere, setDoneHere] = useState<Record<string, string>>({}); // decided in this session, before the next refresh

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, action: 0, urgent: 0, reminder: 0, update: 0 };
    for (const n of feed.items) if (!n.read) { c.all++; c[categoryOf(n)]++; }
    return c;
  }, [feed.items]);
  const shown = filter === 'all' ? feed.items : feed.items.filter((n) => categoryOf(n) === filter);
  const { today, earlier } = groupByDay(shown);

  const open = (n: api.Notification) => {
    feed.markRead(n.id);
    const target = getNavigationTarget({ type: n.type, relatedId: n.relatedId });
    if (target) onOpenTarget(target);
  };

  const decide = async (n: api.Notification, approve: boolean) => {
    if (!n.relatedId || !user.employeeId) return;
    setActing(`${n.id}:${approve}`);
    try {
      if (n.type === 'leave_pending') {
        if (approve) await api.approveLeave(n.relatedId, user.employeeId, user.name);
        else await api.rejectLeave(n.relatedId, user.employeeId, user.name);
      } else if (approve) await api.approveTimesheet(n.relatedId, user.employeeId);
      else await api.rejectTimesheet(n.relatedId, user.employeeId);
      setDoneHere((d) => ({ ...d, [n.id]: approve ? 'approved' : 'rejected' }));
      feed.markRead(n.id);
      toast.success(approve ? t('inbox.done.approved', { name: user.name }) : t('inbox.done.rejected', { name: user.name }));
    } catch (e) {
      toast.error((e as Error)?.message || t('inbox.markFailed'));
    } finally {
      setActing(null);
    }
  };

  const doneLabel = (n: api.Notification) => {
    const verb = doneHere[n.id] || n.resolvedVerb;
    const by = doneHere[n.id] ? user.name : n.resolvedBy || '';
    if (!verb) return null;
    return verb === 'approved' ? t('inbox.done.approved', { name: by }) : verb === 'rejected' ? t('inbox.done.rejected', { name: by }) : t('inbox.done.other', { name: by });
  };

  const row = (n: api.Notification) => {
    const cat = categoryOf(n);
    const look = notificationLook(n.type, cat);
    const done = doneLabel(n);
    const bn = lang === 'bn' && BENGALI_TITLE[n.type] ? ` · ${BENGALI_TITLE[n.type]}` : '';
    const extra = (n.count || 1) > 1 ? (n.items || []).slice(0, 3) : [];
    const inline = !done && INLINE.has(n.type) && !!n.relatedId && !!user.employeeId;
    // The row is itself a button, so approve / reject sit just below it, lined up with the text.
    return (
      <div key={n.id}>
        <ListRow
          leading={<IconWell icon={done ? CheckCircle2 : look.icon} tone={done ? 'success' : look.tone} />}
          title={
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={cn(!n.read ? 'font-semibold' : 'font-medium text-text-2', done && 'text-text-3')}>{n.title}{bn}</span>
              {cat === 'urgent' && !done && <StatusChip tone="danger">{t('inbox.urgentChip')}</StatusChip>}
              {(n.count || 1) > 1 && <StatusChip tone="neutral">{t('inbox.more', { n: (n.count || 1) - 1 })}</StatusChip>}
            </span>
          }
          subtitle={
            <span className="flex flex-col gap-1">
              {n.message && <span className={cn(done && 'text-text-3')}>{n.message}</span>}
              {extra.map((m, i) => <span key={i} className="text-caption text-text-3">· {m}</span>)}
              {done && <span className="text-caption font-medium text-success">{done}</span>}
            </span>
          }
          trailing={
            <span className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
              <span className="num text-caption whitespace-nowrap text-text-3">{formatNotificationTime(n.createdAt, t)}</span>
              {!n.read && <span className={cn('size-2.5 rounded-full', cat === 'urgent' ? 'bg-danger' : 'bg-primary')} role="img" aria-label={t('inbox.unread', { n: 1 })} />}
            </span>
          }
          chevron={!!getNavigationTarget({ type: n.type, relatedId: n.relatedId })}
          onClick={() => open(n)}
        />
        {inline && (
          <div className="flex flex-wrap gap-2 pr-4 pb-3 pl-16">
            <Button size="sm" leadingIcon={<CheckCheck />} loading={acting === `${n.id}:true`} disabled={!!acting} onClick={() => decide(n, true)}>{t('inbox.approve')}</Button>
            <Button size="sm" variant="secondary" leadingIcon={<X />} loading={acting === `${n.id}:false`} disabled={!!acting} onClick={() => decide(n, false)}>{t('inbox.reject')}</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 lg:px-8 lg:py-6" lang={lang}>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="tablist" aria-label={t('inbox.filterBy')}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'hit-44 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-label font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              filter === f.key ? 'border-text bg-text text-bg' : 'border-border-strong bg-surface text-text',
            )}
          >
            {t(f.label)}
            {counts[f.key] > 0 && <span className={cn('num rounded-full px-1.5 text-caption', f.key === 'urgent' ? 'bg-danger text-on-danger' : filter === f.key ? 'bg-bg/20' : 'bg-surface-2')}>{counts[f.key]}</span>}
          </button>
        ))}
      </div>
      <div className="-my-1 flex min-h-11 items-center justify-between gap-3 px-1">
        <span className="num text-body-sm text-text-2">{feed.unreadCount > 0 ? t('inbox.unread', { n: feed.unreadCount }) : t('empty.allCaughtUp')}</span>
        <span className="flex items-center gap-1">
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
          <IconButton label={t('inbox.settings')} icon={<Settings2 />} onClick={() => setSettingsOpen(true)} />
        </span>
      </div>
      {feed.status === 'loading' && feed.items.length === 0 ? (
        <SkeletonListRows count={6} />
      ) : feed.status === 'error' ? (
        <ErrorState onRetry={() => feed.refresh()} />
      ) : shown.length === 0 ? (
        <EmptyState icon={BellOff} title={t('inbox.empty')} body={t('inbox.emptyBody')} />
      ) : (
        <>
          {today.length > 0 && <ListGroup overline={t('date.today')}>{today.map(row)}</ListGroup>}
          {earlier.length > 0 && <ListGroup overline={t('inbox.earlier')}>{earlier.map(row)}</ListGroup>}
        </>
      )}
      {settingsOpen && <NotificationSettings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function NotificationSettings({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [prefs, setPrefs] = useState<api.NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const load = () => { setLoadFailed(false); api.getNotificationPrefs().then((r) => setPrefs(r.prefs)).catch(() => setLoadFailed(true)); };
  useEffect(load, []);
  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try { await api.saveNotificationPrefs(prefs); toast.success(t('inbox.saved')); setOpen(false); } catch (e) { toast.error((e as Error)?.message || t('inbox.saveFailed')); } finally { setSaving(false); }
  };
  const kinds: { key: 'action' | 'reminder' | 'update'; label: I18nKey }[] = [
    { key: 'action', label: 'inbox.f.action' }, { key: 'reminder', label: 'inbox.f.reminder' }, { key: 'update', label: 'inbox.f.update' },
  ];
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title={t('inbox.settings')}
      footer={<Button size="lg" className="flex-1" loading={saving} disabled={!prefs} onClick={save}>{t('common.save')}</Button>}>
      {loadFailed ? <ErrorState onRetry={load} /> : !prefs ? <SkeletonListRows count={4} /> : (
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox checked={prefs.quietOn} onCheckedChange={(v) => setPrefs({ ...prefs, quietOn: v === true })} />
              <span className="text-body-md font-medium text-text">{t('inbox.quiet')}</span>
            </label>
            <p className="text-label text-text-3">{t('inbox.quietHint')}</p>
            {prefs.quietOn && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('inbox.from')}><Input type="time" className="num" value={prefs.quietFrom} onChange={(e) => setPrefs({ ...prefs, quietFrom: e.target.value })} /></Field>
                <Field label={t('inbox.to')}><Input type="time" className="num" value={prefs.quietTo} onChange={(e) => setPrefs({ ...prefs, quietTo: e.target.value })} /></Field>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-1">
            <span className="text-body-md font-medium text-text">{t('inbox.mute')}</span>
            <label className="flex min-h-11 items-center gap-3 opacity-70">
              <Checkbox checked disabled />
              <span className="text-body-sm text-text">{t('inbox.f.urgent')}</span>
            </label>
            {kinds.map((k) => (
              <label key={k.key} className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox checked={!prefs.muted?.[k.key]} onCheckedChange={(v) => setPrefs({ ...prefs, muted: { ...prefs.muted, [k.key]: v !== true } })} />
                <span className="text-body-sm text-text">{t(k.label)}</span>
              </label>
            ))}
            <p className="text-label text-text-3">{t('inbox.muteHint')}</p>
          </section>
          <section className="flex flex-col gap-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox checked={prefs.digest} onCheckedChange={(v) => setPrefs({ ...prefs, digest: v === true })} />
              <span className="text-body-md font-medium text-text">{t('inbox.digest')}</span>
            </label>
            <p className="text-label text-text-3">{t('inbox.digestHint')}</p>
          </section>
          <Button variant="secondary" loading={testing} onClick={async () => {
            setTesting(true);
            try { const r = await api.sendTestNotification(); if (r.sent) toast.success(t('inbox.testSent')); else toast.error(t('inbox.testFailed')); } catch { toast.error(t('inbox.testFailed')); } finally { setTesting(false); }
          }}>{t('inbox.test')}</Button>
        </div>
      )}
    </ResponsiveModal>
  );
}

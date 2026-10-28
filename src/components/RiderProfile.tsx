// The rider's own profile (Me → Rider profile): name, Aadhaar, the rate they want for one complete
// ride (the default for every ride, which they can still change per ride before accepting), and
// the hours they are available each day. Production sees a rider as unavailable outside these
// hours. Each row opens a sheet; saving a sheet saves the whole profile (PUT /rider/profile, the
// same body and the same checks as the old single Save button).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CircleCheck, CircleOff, IdCard, IndianRupee, User } from 'lucide-react';
import { toast } from './ui/sonner';
import type { RiderDaySchedule, RiderWeekSchedule } from '../utils/api';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { ErrorState } from './ui/error-state';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { ListGroup, ListRow } from './ui/list-row';
import { MoneyInput, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { Skeleton, SkeletonListRows } from './ui/skeleton';
import { StatusChip } from './ui/status-chip';
import { Switch } from './ui/switch';
import { useT, type I18nKey } from '../utils/i18n';
import { useRiderApi } from './riders/riderApi';

type DayKey = keyof RiderWeekSchedule;
const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const DEFAULT_DAY: RiderDaySchedule = { enabled: true, from: '09:00', to: '21:00' };

const emptyWeek = (): RiderWeekSchedule =>
  Object.fromEntries(DAYS.map((d) => [d, { ...DEFAULT_DAY }])) as RiderWeekSchedule;

// 123412341234 -> "1234 1234 1234"
const groupAadhaar = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');

// "21:00" -> "9:00 pm"
const clock = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5) || '00'} ${h >= 12 ? 'pm' : 'am'}`;
};

type Profile = { name: string; aadhaar: string; rate: string; week: RiderWeekSchedule };
type Editing = 'name' | 'aadhaar' | 'rate' | DayKey | null;

export function RiderProfile() {
  const rapi = useRiderApi();
  const { t, lang } = useT();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({ name: '', aadhaar: '', rate: '', week: emptyWeek() });
  const [status, setStatus] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState<Profile>(profile);

  const dayLabel = useCallback((d: DayKey) => t(`rider.day.${d}` as I18nKey), [t]);

  const load = useCallback(async () => {
    try {
      const data = await rapi.getRiderProfile();
      setProfile({
        name: data.profile.name || '',
        aadhaar: (data.profile.aadhaar || '').replace(/\D/g, ''),
        rate: data.profile.defaultRate ? String(data.profile.defaultRate) : '',
        week: { ...emptyWeek(), ...(data.profile.availability || {}) } as RiderWeekSchedule,
      });
      setStatus({ available: data.available, reason: data.unavailableReason });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('rider.profile.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [rapi, t]);
  useEffect(() => { load(); }, [load]);

  const startEdit = (what: Exclude<Editing, null>) => { setDraft(profile); setEditing(what); };
  const dirty = useMemo(() => editing !== null && JSON.stringify(draft) !== JSON.stringify(profile), [editing, draft, profile]);

  const setDay = (key: DayKey, patch: Partial<RiderDaySchedule>) =>
    setDraft((prev) => ({ ...prev, week: { ...prev.week, [key]: { ...prev.week[key], ...patch } } }));

  // The same checks as before, on the whole profile with this sheet's change in it.
  const save = async (next: Profile) => {
    if (next.name.trim().length < 2) { toast.error(t('rider.profile.errName')); return; }
    if (next.aadhaar && next.aadhaar.length !== 12) { toast.error(t('rider.profile.errAadhaar')); return; }
    const rateNumber = next.rate === '' ? null : Number(next.rate);
    if (rateNumber !== null && (!isFinite(rateNumber) || rateNumber < 0)) { toast.error(t('rider.profile.errRate')); return; }
    for (const d of DAYS) {
      const day = next.week[d];
      if (day.enabled && day.from >= day.to) { toast.error(t('rider.profile.errDay', { day: dayLabel(d) })); return; }
    }
    setSaving(true);
    try {
      await rapi.saveRiderProfile({ name: next.name.trim(), aadhaar: next.aadhaar, defaultRate: rateNumber, availability: next.week });
      toast.success(t('rider.profile.saved'));
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('rider.profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-4 pb-6 sm:px-6 lg:px-8" role="status" aria-label={t('common.loading')}>
        <Skeleton className="h-14 w-full rounded-lg" />
        <SkeletonListRows count={3} />
        <SkeletonListRows count={7} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-4 pb-6 sm:px-6 lg:px-8">
        <ErrorState body={error} onRetry={() => { setLoading(true); load(); }} />
      </div>
    );
  }

  const isDay = editing !== null && (DAYS as string[]).includes(editing);
  const sheetTitle = editing === 'name' ? t('rider.profile.name') : editing === 'aadhaar' ? t('rider.profile.aadhaar') : editing === 'rate' ? t('rider.profile.rate') : isDay ? dayLabel(editing as DayKey) : '';
  const rateValue = profile.rate === '' ? null : Number(profile.rate);

  return (
    <div lang={lang} className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 pt-4 pb-6 sm:px-6 lg:px-8 lg:pt-6">
      {status && (
        <Callout tone={status.available ? 'success' : 'warning'} icon={status.available ? CircleCheck : CircleOff} title={status.available ? t('rider.profile.availableNow') : t('rider.profile.unavailableNow', { reason: status.reason || '' })} />
      )}

      <ListGroup title={t('rider.profile.details')}>
        <ListRow icon={User} title={t('rider.profile.name')} subtitle={profile.name || t('rider.profile.notSet')} onClick={() => startEdit('name')} />
        <ListRow icon={IdCard} title={t('rider.profile.aadhaar')} subtitle={profile.aadhaar ? groupAadhaar(profile.aadhaar) : t('rider.profile.notSet')} onClick={() => startEdit('aadhaar')} />
        <ListRow
          icon={IndianRupee}
          title={t('rider.profile.rate')}
          subtitle={rateValue !== null ? t('rider.staff.perRide', { amount: formatINR(rateValue) }) : t('rider.profile.notSet')}
          onClick={() => startEdit('rate')}
        />
      </ListGroup>

      <ListGroup title={t('rider.profile.hours')} footer={t('rider.profile.hoursHelp')}>
        {DAYS.map((d) => {
          const day = profile.week[d];
          return (
            <ListRow
              key={d}
              icon={CalendarClock}
              title={dayLabel(d)}
              subtitle={day.enabled ? <span className="num">{clock(day.from)} – {clock(day.to)}</span> : undefined}
              trailing={day.enabled ? undefined : <StatusChip tone="neutral">{t('rider.profile.dayOff')}</StatusChip>}
              chevron
              onClick={() => startEdit(d)}
            />
          );
        })}
      </ListGroup>

      <ResponsiveModal
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        title={sheetTitle}
        dirty={dirty}
        footer={isDay ? (
          <>
            <Button variant="secondary" size="lg" disabled={saving} onClick={() => {
              const src = draft.week[editing as DayKey];
              save({ ...draft, week: Object.fromEntries(DAYS.map((d) => [d, { ...src }])) as RiderWeekSchedule });
            }}>
              {t('rider.profile.everyDay')}
            </Button>
            <Button size="lg" className="flex-1" loading={saving} onClick={() => save(draft)}>{t('common.save')}</Button>
          </>
        ) : (
          <Button size="lg" fullWidth loading={saving} onClick={() => save(draft)}>{t('common.save')}</Button>
        )}
      >
        {editing === 'name' && (
          <Field label={t('rider.profile.name')}>
            <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} autoComplete="name" autoFocus />
          </Field>
        )}
        {editing === 'aadhaar' && (
          <Field label={t('rider.profile.aadhaar')} helper={t('rider.profile.aadhaarHelp')}>
            <Input
              value={groupAadhaar(draft.aadhaar)}
              onChange={(e) => setDraft((p) => ({ ...p, aadhaar: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
              inputMode="numeric"
              placeholder="1234 5678 9012"
              className="num tracking-wide"
              autoFocus
            />
          </Field>
        )}
        {editing === 'rate' && (
          <Field label={t('rider.profile.rate')} helper={t('rider.profile.rateHelp')}>
            <MoneyInput value={draft.rate} decimals={0} onValueChange={(_n, raw) => setDraft((p) => ({ ...p, rate: raw.replace(/[^\d]/g, '') }))} placeholder="300" />
          </Field>
        )}
        {isDay && (() => {
          const d = editing as DayKey;
          const day = draft.week[d];
          return (
            <div className="flex flex-col gap-4">
              <label className="flex min-h-13 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4">
                <span className="text-body-md font-medium text-text">{t('rider.profile.works')}</span>
                <Switch checked={day.enabled} onCheckedChange={(on) => setDay(d, { enabled: on })} aria-label={t('rider.profile.works')} />
              </label>
              {day.enabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('rider.profile.from')}>
                    <Input type="time" value={day.from} onChange={(e) => setDay(d, { from: e.target.value })} />
                  </Field>
                  <Field label={t('rider.profile.to')}>
                    <Input type="time" value={day.to} onChange={(e) => setDay(d, { to: e.target.value })} />
                  </Field>
                </div>
              ) : (
                <p className="text-body-sm text-text-2">{t('rider.profile.dayOffBody')}</p>
              )}
            </div>
          );
        })()}
      </ResponsiveModal>
    </div>
  );
}

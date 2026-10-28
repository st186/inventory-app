// Rider: available according to the hours in the rider profile, unless they switch themselves off
// here. Production sees the same status (red when unavailable) when calling riders.
import { useCallback, useEffect, useState } from 'react';
import { Check, CircleCheck, CircleOff, Clock } from 'lucide-react';
import { toast } from '../ui/sonner';
import type * as api from '../../utils/api';
import { isAppVisible } from '../../utils/appVisibility';
import { Button } from '../ui/button';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SkeletonListRows } from '../ui/skeleton';
import { Switch } from '../ui/switch';
import { cn } from '../ui/utils';
import { useT, type I18nKey } from '../../utils/i18n';
import { useRiderApi } from './riderApi';

const DURATIONS: api.RiderUnavailableFor[] = ['hour', 'three_hours', 'rest_of_day', 'until_back'];

export function RiderAvailability({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const rapi = useRiderApi();
  const { t } = useT();
  const [info, setInfo] = useState<api.RiderProfileResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState<api.RiderUnavailableFor>('rest_of_day');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    rapi.getRiderProfile().then((r) => { setInfo(r); setFailed(false); }).catch(() => setFailed(true));
  }, [rapi]);
  useEffect(() => {
    load();
    const interval = setInterval(() => { if (isAppVisible()) load(); }, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const change = async (unavailable: boolean) => {
    setBusy(true);
    try {
      await rapi.setRiderAvailability({ unavailable, duration: unavailable ? duration : undefined });
      toast.success(unavailable ? t('rider.avail.offToast') : t('rider.avail.onToast'));
      setAsking(false);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('rider.avail.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (!info) {
    if (failed) {
      return (
        <ListGroup title={t('rider.avail.title')}>
          <ListRow icon={Clock} title={t('rider.avail.loadFailed')} trailing={<Button variant="secondary" size="sm" onClick={load}>{t('common.retry')}</Button>} />
        </ListGroup>
      );
    }
    return (
      <section className="flex flex-col gap-2.5" aria-busy="true">
        <h2 className="text-subtitle font-semibold text-text">{t('rider.avail.title')}</h2>
        <SkeletonListRows count={1} />
      </section>
    );
  }

  const until = info.profile.unavailableUntil;
  const manual = until === 'indefinite' || (!!until && new Date(until).getTime() > Date.now());
  // Off because of the hours in the profile (not switched off here): only the profile changes it.
  const bySchedule = !info.available && !manual;

  return (
    <>
      <ListGroup title={t('rider.avail.title')}>
        <ListRow
          icon={info.available ? CircleCheck : CircleOff}
          iconTone={info.available ? 'success' : 'danger'}
          title={info.available ? t('rider.avail.on') : t('rider.avail.off')}
          subtitle={info.available ? t('rider.avail.schedule') : info.unavailableReason}
          trailing={
            <Switch
              checked={info.available}
              disabled={busy || bySchedule}
              aria-label={t('rider.avail.title')}
              onCheckedChange={(on) => { if (on) { if (manual) change(false); } else setAsking(true); }}
            />
          }
        />
        {bySchedule && onOpenProfile && (
          <ListRow icon={Clock} title={t('rider.avail.changeHours')} onClick={onOpenProfile} />
        )}
        {bySchedule && !onOpenProfile && (
          <ListRow density="compact" title={<span className="text-body-sm font-normal text-text-2">{t('rider.avail.changeHours')}</span>} />
        )}
      </ListGroup>

      <ResponsiveModal
        open={asking}
        onOpenChange={setAsking}
        title={t('rider.avail.howLong')}
        description={t('rider.avail.sheetBody')}
        footer={<Button size="lg" fullWidth loading={busy} onClick={() => change(true)}>{t('rider.avail.goOff')}</Button>}
      >
        <div role="radiogroup" aria-label={t('rider.avail.howLong')} className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {DURATIONS.map((d) => {
            const on = duration === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDuration(d)}
                className={cn(
                  'flex min-h-13 w-full items-center gap-3 px-4 text-left text-body-md outline-none transition-colors duration-(--dur-fast) focus-visible:bg-surface-2',
                  on ? 'bg-primary-soft font-semibold text-text' : 'text-text hover:bg-surface-2/60',
                )}
              >
                <span className="flex-1">{t(`rider.avail.${d}` as I18nKey)}</span>
                {on && <Check className="size-5 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </ResponsiveModal>
    </>
  );
}

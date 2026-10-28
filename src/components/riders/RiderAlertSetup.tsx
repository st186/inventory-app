// Rider only (Android app): the loud horn / full-screen ride-request alert needs a few phone
// settings that Android makes the rider grant themselves. Shows what's still off, opens the right
// settings page for each, and lets the rider test the sound.
import { useCallback, useEffect, useState } from 'react';
import { BatteryCharging, Bell, BellRing, Maximize, MoonStar, type LucideIcon } from 'lucide-react';
import { toast } from '../ui/sonner';
import type { RiderAlertStatus } from '../../utils/riderAlert';
import { Button } from '../ui/button';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { useRiderApi } from './riderApi';
import { useRideWords } from './rideWords';

type SettingKey = 'notifications' | 'fullScreen' | 'doNotDisturb' | 'battery';
const ITEMS: { key: SettingKey; icon: LucideIcon }[] = [
  { key: 'notifications', icon: Bell },
  { key: 'fullScreen', icon: Maximize },
  { key: 'doNotDisturb', icon: MoonStar },
  { key: 'battery', icon: BatteryCharging },
];

export function RiderAlertSetup() {
  const rapi = useRiderApi();
  const w = useRideWords();
  const [status, setStatus] = useState<RiderAlertStatus | null>(null);

  const refresh = useCallback(() => { rapi.getAlertStatus().then(setStatus); }, [rapi]);
  useEffect(() => {
    refresh();
    // Re-check when the rider comes back from a settings page.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  if (!rapi.alertSupported() || !status) return null;

  const missing = ITEMS.filter((i) => !status[i.key]);
  const last = status.lastReceivedAt
    ? status.lastError
      ? w.t('rider.alert.lastError', { age: w.age(new Date(status.lastReceivedAt).toISOString()), error: status.lastError })
      : status.lastPostedAt >= status.lastReceivedAt
        ? w.t('rider.alert.lastShown', { age: w.age(new Date(status.lastReceivedAt).toISOString()) })
        : w.t('rider.alert.last', { age: w.age(new Date(status.lastReceivedAt).toISOString()) })
    : w.t('rider.alert.never');

  return (
    <ListGroup
      title={w.t('rider.alert.title')}
      action={missing.length === 0 ? <StatusChip tone="success">{w.t('rider.alert.ready')}</StatusChip> : <StatusChip tone="warning">{w.t('rider.alert.setup')}</StatusChip>}
      footer={missing.length > 0 ? `${w.t('rider.alert.why')} ${last}` : last}
    >
      {missing.map((i) => (
        <ListRow
          key={i.key}
          icon={i.icon}
          iconTone="warning"
          title={w.t(`rider.alert.${i.key}`)}
          subtitle={w.t(`rider.alert.${i.key}Why`)}
          trailing={<Button variant="secondary" size="sm" onClick={() => rapi.openAlertSetting[i.key]()}>{w.t('rider.alert.allow')}</Button>}
        />
      ))}
      <ListRow
        icon={BellRing}
        title={w.t('rider.alert.test')}
        subtitle={missing.length === 0 ? w.t('rider.alert.ready') : undefined}
        onClick={async () => {
          const result = await rapi.testAlert();
          if (result.posted) toast.success(w.t('rider.alert.testSent'));
          else toast.error(w.t('rider.alert.testFailed', { reason: result.error || w.t('rider.alert.unknown') }));
          refresh();
        }}
      />
    </ListGroup>
  );
}

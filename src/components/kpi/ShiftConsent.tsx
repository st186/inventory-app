import { useEffect, useState } from 'react';
import { BatteryCharging, CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { getRiderAlertStatus, openRiderAlertSetting, riderAlertSupported } from '../../utils/riderAlert';
import { useT } from '../../utils/i18n';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Button } from '../ui/button';
import { StatusChip } from '../ui/status-chip';
import { useHomeData } from '../home/homeData';
import { consentKey, openLocationSettings } from './shiftTracker';

// "Why location?" (owner, 27 Oct 2026): what is checked, when, what is kept and what it's used for.
// With `canAsk` (the Android app, consent not given yet) it also asks to turn on automatic
// check-in and then walks through the two phone settings it needs ("Allow all the time" location,
// no battery restriction). The battery page opens through the same native helper as the rider
// alert setup. Otherwise it only explains.
export function ShiftConsent({ open, onOpenChange, employeeId, canAsk, onDecided }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  canAsk: boolean;
  onDecided?: (accepted: boolean) => void;
}) {
  const { t, lang } = useT();
  const data = useHomeData();
  const [step, setStep] = useState<'explain' | 'settings'>('explain');
  const [saving, setSaving] = useState(false);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || step !== 'settings' || !riderAlertSupported()) return;
    const check = () => { getRiderAlertStatus().then((s) => setBatteryOk(s ? s.battery : null)); };
    check();
    // Re-check when the person comes back from the settings page.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [open, step]);

  const decide = async (accepted: boolean) => {
    setSaving(true);
    try {
      await data.saveShiftConsent(accepted);
      try { localStorage.setItem(consentKey(employeeId), accepted ? 'yes' : 'no'); } catch { /* ignore */ }
      if (accepted) setStep('settings');
      else { onDecided?.(false); onOpenChange(false); }
    } catch (e: any) {
      toast.error(e?.message || t('consent.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const close = (next: boolean) => {
    if (!next && step === 'settings') onDecided?.(true);
    onOpenChange(next);
  };

  const explain = (
    <ul className="flex flex-col gap-3 text-body-sm text-text-2">
      {(['consent.p1', 'consent.p2', 'consent.p3', 'consent.p4'] as const).map((key) => (
        <li key={key} className="flex gap-2.5">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden="true" />
          <span>{t(key)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={close}
      onClosed={() => setStep('explain')}
      title={step === 'settings' ? t('consent.settingsTitle') : canAsk ? t('consent.autoTitle') : t('consent.title')}
      description={step === 'settings' ? t('consent.settingsBody') : undefined}
      footer={step === 'settings' ? (
        <Button size="lg" fullWidth onClick={() => close(false)}>{t('common.done')}</Button>
      ) : canAsk ? (
        <>
          <Button variant="secondary" size="lg" disabled={saving} onClick={() => decide(false)}>{t('consent.notNow')}</Button>
          <Button size="lg" className="flex-1" loading={saving} onClick={() => decide(true)}>{t('consent.agree')}</Button>
        </>
      ) : (
        <Button variant="secondary" size="lg" fullWidth onClick={() => close(false)}>{t('common.close')}</Button>
      )}
    >
      <div lang={lang} data-ai-private>
        {step === 'explain' ? explain : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3.5">
              <p className="flex items-center gap-2 text-body-md font-semibold text-text"><MapPin className="size-5 text-text-2" aria-hidden="true" /> {t('consent.locationTitle')}</p>
              <p className="text-body-sm text-text-2">{t('consent.locationBody')}</p>
              <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={openLocationSettings}>{t('consent.openSettings')}</Button>
            </div>
            <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3.5">
              <p className="flex flex-wrap items-center gap-2 text-body-md font-semibold text-text">
                <BatteryCharging className="size-5 text-text-2" aria-hidden="true" /> {t('consent.batteryTitle')}
                {batteryOk === true && <StatusChip status="task.done" />}
              </p>
              <p className="text-body-sm text-text-2">{t('consent.batteryBody')}</p>
              {riderAlertSupported() && (
                <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => openRiderAlertSetting.battery()}>{t('consent.openBattery')}</Button>
              )}
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

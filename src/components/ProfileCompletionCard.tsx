import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Camera, IdCard, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type * as api from '../utils/api';
import { useT, type I18nKey } from '../utils/i18n';
import { ResponsiveModal } from './ui/responsive-modal';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { useHomeData } from './home/homeData';

// "Complete your profile" for anyone who hasn't uploaded their Aadhaar card (both sides) or added
// their phone and personal email (owner, 27 Oct 2026). On Home it is a checklist row that opens
// the sheet below; the form saves to the person's own record only (server profile.ts). Not shown
// to the owner or the audit login (the server says `required: false` for them).

type Missing = api.MyProfileStatus['missing'][number];
const LABEL: Record<Missing, I18nKey> = {
  aadharFront: 'profile.aadharFront',
  aadharBack: 'profile.aadharBack',
  phone: 'profile.phone',
  contactEmail: 'profile.email',
};

// Phone photos are several MB: shrink to 1600 px JPEG (~300 KB) before sending.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/** The person's profile status (one request), whether it still needs details, and the sheet. */
export function useProfileCompletion(accessToken: string) {
  const data = useHomeData();
  const [status, setStatus] = useState<api.MyProfileStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) { setLoaded(true); return; }
    let cancelled = false;
    data.getMyProfile(accessToken)
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { /* older server or offline: nothing to ask for */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [accessToken, data]);

  const needed = !!status?.required && !status.complete;
  const openSheet = useCallback(() => setOpen(true), []);
  const sheet = status && needed ? (
    <ProfileSheet open={open} onOpenChange={setOpen} accessToken={accessToken} status={status} onSaved={setStatus} />
  ) : null;
  return { status, loaded, needed, openSheet, sheet };
}

function PhotoPick({ label, value, onPick }: { label: string; value: string; onPick: (dataUrl: string) => void }) {
  const { t } = useT();
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { onPick(await compressImage(file)); } catch { toast.error(t('profile.photoFailed')); }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-body-sm font-medium text-text">{label}</span>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-2 px-3 py-2 outline-none focus-within:ring-2 focus-within:ring-ring">
        {value
          ? <img src={value} alt="" className="h-11 w-16 rounded-sm object-cover" />
          : <Camera className="size-6 text-text-2" aria-hidden="true" />}
        <span className="text-body-md font-semibold text-primary">{value ? t('profile.retake') : t('profile.takePhoto')}</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
      </label>
    </div>
  );
}

/** The form: phone, personal email and the Aadhaar photos still missing. */
export function ProfileSheet({ open, onOpenChange, accessToken, status, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessToken: string;
  status: api.MyProfileStatus;
  onSaved: (next: api.MyProfileStatus) => void;
}) {
  const { t, lang } = useT();
  const data = useHomeData();
  const [phone, setPhone] = useState(status.phone || '');
  const [email, setEmail] = useState(status.contactEmail || '');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const needs = (f: Missing) => status.missing.includes(f);
  const dirty = !!front || !!back || phone.trim() !== (status.phone || '') || email.trim() !== (status.contactEmail || '');

  const save = async () => {
    const updates: Parameters<typeof api.updateMyProfile>[1] = {};
    if (phone.trim() && phone.trim() !== status.phone) updates.phone = phone.trim();
    if (email.trim() && email.trim() !== status.contactEmail) updates.contactEmail = email.trim();
    if (front) updates.aadharFront = front;
    if (back) updates.aadharBack = back;
    if (!Object.keys(updates).length) { toast.error(t('profile.addMissing')); return; }
    setSaving(true);
    try {
      const next = await data.updateMyProfile(accessToken, updates);
      onSaved({ ...status, ...next });
      setFront('');
      setBack('');
      if (next.complete) {
        toast.success(t('profile.complete'));
        onOpenChange(false);
      } else {
        toast.success(t('profile.savedStill', { list: next.missing.map((m) => t(LABEL[m])).join(', ') }));
      }
    } catch (e: any) {
      toast.error(e?.message || t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('profile.title')}
      description={t('profile.stillNeeded', { list: status.missing.map((m) => t(LABEL[m])).join(', ') })}
      dirty={dirty && !saving}
      footer={<Button size="lg" fullWidth loading={saving} onClick={save}>{t('common.save')}</Button>}
    >
      <div className="flex flex-col gap-4" data-ai-private lang={lang}>
        <Field label={<span className="inline-flex items-center gap-1.5"><Phone className="size-4" aria-hidden="true" />{t('profile.phone')}</span>}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" />
        </Field>
        <Field label={<span className="inline-flex items-center gap-1.5"><Mail className="size-4" aria-hidden="true" />{t('profile.email')}</span>} helper={t('profile.emailHint')}>
          <Input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
        </Field>
        {(needs('aadharFront') || front) && <PhotoPick label={t('profile.aadharFront')} value={front} onPick={setFront} />}
        {(needs('aadharBack') || back) && <PhotoPick label={t('profile.aadharBack')} value={back} onPick={setBack} />}
        {!needs('aadharFront') && !needs('aadharBack') && (
          <p className="inline-flex items-center gap-1.5 text-body-sm text-success"><BadgeCheck className="size-4" aria-hidden="true" /> {t('profile.aadharDone')}</p>
        )}
        <p className="text-caption text-text-3">{t('profile.ownerOnly')}</p>
      </div>
    </ResponsiveModal>
  );
}

/** A callout that opens the sheet (screens that want the old card rather than a checklist row). */
export function ProfileCompletionCard({ accessToken }: { accessToken: string }) {
  const { t } = useT();
  const profile = useProfileCompletion(accessToken);
  if (!profile.needed || !profile.status) return null;
  return (
    <>
      <Callout
        tone="warning"
        icon={IdCard}
        title={t('home.task.profile')}
        onClick={profile.openSheet}
      >
        {t('profile.stillNeeded', { list: profile.status.missing.map((m) => t(LABEL[m])).join(', ') })}
      </Callout>
      {profile.sheet}
    </>
  );
}

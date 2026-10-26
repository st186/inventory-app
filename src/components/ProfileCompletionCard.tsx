import { useEffect, useState } from 'react';
import { BadgeCheck, Camera, IdCard, Loader2, Mail, Phone, X } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../utils/api';

// Home screen card for anyone who hasn't uploaded their Aadhaar card (both sides) or added their
// phone and personal email (owner, 27 Oct 2026). Shown until it's all done; the form saves to
// the person's own record only (server profile.ts). Not shown to the owner or the audit login.

const LABEL: Record<api.MyProfileStatus['missing'][number], string> = {
  aadharFront: 'Aadhaar card - front · আধার কার্ডের সামনে',
  aadharBack: 'Aadhaar card - back · আধার কার্ডের পিছনে',
  phone: 'Mobile number · মোবাইল নম্বর',
  contactEmail: 'Personal email · নিজের ইমেল',
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo - try again')); };
    img.src = url;
  });
}

export function ProfileCompletionCard({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState<api.MyProfileStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    api.getMyProfile(accessToken)
      .then((s) => { if (!cancelled) { setStatus(s); setPhone(s.phone || ''); setEmail(s.contactEmail || ''); } })
      .catch(() => { /* older server or offline: no card */ });
    return () => { cancelled = true; };
  }, [accessToken]);

  if (!status?.required || status.complete) return null;
  const needs = (f: api.MyProfileStatus['missing'][number]) => status.missing.includes(f);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>, set: (v: string) => void) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { set(await compressImage(file)); } catch (err: any) { toast.error(err?.message || 'Could not read that photo'); }
  };

  const save = async () => {
    const updates: Parameters<typeof api.updateMyProfile>[1] = {};
    if (phone.trim() && phone.trim() !== status.phone) updates.phone = phone.trim();
    if (email.trim() && email.trim() !== status.contactEmail) updates.contactEmail = email.trim();
    if (front) updates.aadharFront = front;
    if (back) updates.aadharBack = back;
    if (!Object.keys(updates).length) return toast.error('Add the missing details first');
    setSaving(true);
    try {
      const next = await api.updateMyProfile(accessToken, updates);
      setStatus({ ...status, ...next });
      setFront('');
      setBack('');
      if (next.complete) {
        toast.success('Profile complete - thank you!');
        setOpen(false);
      } else {
        toast.success('Saved. Still needed: ' + next.missing.map((m) => LABEL[m].split(' · ')[0]).join(', '));
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full mt-1 px-3 py-2.5 border border-gray-300 rounded-xl text-base bg-white';
  const PhotoPick = ({ label, value, set }: { label: string; value: string; set: (v: string) => void }) => (
    <div>
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <label className="mt-1 flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50 cursor-pointer">
        {value ? <img src={value} alt="" className="w-16 h-11 object-cover rounded-md" /> : <Camera className="w-6 h-6 text-orange-600" />}
        <span className="text-sm font-semibold text-orange-700">{value ? 'Retake photo' : 'Take photo / choose'}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e, set)} />
      </label>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <div className="rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:p-5 shadow-sm" role="alert">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0"><IdCard className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">Complete your profile now · প্রোফাইল এখনই সম্পূর্ণ করুন</p>
            <p className="text-sm text-gray-700 mt-0.5">Still needed:</p>
            <ul className="text-sm text-gray-800 mt-1 space-y-0.5">
              {status.missing.map((m) => <li key={m}>• {LABEL[m]}</li>)}
            </ul>
            <button type="button" onClick={() => setOpen(true)} className="mt-3 px-4 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold">
              Upload now · এখনই আপলোড করুন
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center" data-ai-private>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <p className="font-bold text-gray-900">Your profile · আপনার প্রোফাইল</p>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 text-gray-500" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <label className="block text-xs font-medium text-gray-700">
                <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Mobile number · মোবাইল নম্বর</span>
                <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98xxxxxxxx" className={field} />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Personal email · নিজের ইমেল</span>
                <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" className={field} />
                <span className="block mt-1 text-[11px] text-gray-500 font-normal">Your login stays the same.</span>
              </label>
              {(needs('aadharFront') || front) && <PhotoPick label={LABEL.aadharFront} value={front} set={setFront} />}
              {(needs('aadharBack') || back) && <PhotoPick label={LABEL.aadharBack} value={back} set={setBack} />}
              {!needs('aadharFront') && !needs('aadharBack') && (
                <p className="text-xs text-emerald-700 inline-flex items-center gap-1"><BadgeCheck className="w-4 h-4" /> Aadhaar card already uploaded</p>
              )}
              <p className="text-[11px] text-gray-500">Only the owner can see your Aadhaar card.</p>
            </div>
            <div className="p-4 border-t border-gray-200">
              <button type="button" onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-orange-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save · সেভ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

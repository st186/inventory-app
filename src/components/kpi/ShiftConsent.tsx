import { useEffect, useState } from 'react';
import { BatteryCharging, Loader2, MapPin, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { getRiderAlertStatus, openRiderAlertSetting, riderAlertSupported } from '../../utils/riderAlert';
import * as kpi from './kpiApi';
import { consentKey, openLocationSettings } from './shiftTracker';

// First-time consent for automatic check-in (owner, 27 Oct 2026), in English and Bengali: what is
// checked, when, what is kept and what it's used for - then the two phone settings it needs
// ("Allow all the time" location, no battery restriction). The battery page is opened through
// the same native helper as the rider alert setup.
export function ShiftConsent({ employeeId, onClose }: { employeeId: string; onClose: (accepted: boolean) => void }) {
  const [step, setStep] = useState<'explain' | 'settings'>('explain');
  const [saving, setSaving] = useState(false);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (step !== 'settings' || !riderAlertSupported()) return;
    const check = () => { getRiderAlertStatus().then((s) => setBatteryOk(s ? s.battery : null)); };
    check();
    // Re-check when the person comes back from the settings page.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [step]);

  const decide = async (accepted: boolean) => {
    setSaving(true);
    try {
      await kpi.saveShiftConsent(accepted);
      try { localStorage.setItem(consentKey(employeeId), accepted ? 'yes' : 'no'); } catch { /* ignore */ }
      if (accepted) setStep('settings'); else onClose(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save - try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto p-5 relative">
        <button onClick={() => onClose(step === 'settings')} className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        {step === 'explain' ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-6 h-6 text-orange-600" />
              <h2 className="text-lg font-bold text-gray-900">Automatic check-in · স্বয়ংক্রিয় চেক-ইন</h2>
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li>
                <p>Your location is checked <b>only around your shift</b> - from 1 hour before it starts to 1 hour after it ends, on working days.</p>
                <p className="text-gray-500">শুধু আপনার শিফটের সময়ের আশেপাশে - শুরুর ১ ঘণ্টা আগে থেকে শেষের ১ ঘণ্টা পর পর্যন্ত, কাজের দিনে - লোকেশন দেখা হবে।</p>
              </li>
              <li>
                <p><b>Only the time and place you arrive and leave</b> are saved. Where else you go is never sent or kept.</p>
                <p className="text-gray-500">শুধু পৌঁছানো আর বেরোনোর সময় ও জায়গা রাখা হবে। আপনি আর কোথায় যান তা পাঠানো বা রাখা হয় না।</p>
              </li>
              <li>
                <p>It is used for your <b>attendance and pay</b> (on-time and full-shift scores). You confirm each check-in yourself.</p>
                <p className="text-gray-500">এটা আপনার হাজিরা আর বেতনের জন্য ব্যবহার হবে। প্রতিটি চেক-ইন আপনি নিজে নিশ্চিত করবেন।</p>
              </li>
              <li>
                <p>You can still use the Start shift / End shift buttons, and turn this off by saying no.</p>
                <p className="text-gray-500">শিফট শুরু / শেষ বোতামও ব্যবহার করতে পারবেন। না বললে এটা বন্ধ থাকবে।</p>
              </li>
            </ul>
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button disabled={saving} onClick={() => decide(true)} className="flex-1 px-4 py-3 rounded-xl bg-orange-600 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Agree and turn on · রাজি, চালু করুন
              </button>
              <button disabled={saving} onClick={() => decide(false)} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-800 font-semibold disabled:opacity-50">
                Not now · এখন না
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Two phone settings · ফোনের দুটি সেটিং</h2>
            <p className="text-sm text-gray-600 mb-4">So the phone notices you arriving while it is in your pocket. · ফোন পকেটে থাকলেও যাতে পৌঁছানো বোঝা যায়।</p>
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="font-semibold text-gray-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-600" /> Location: Allow all the time</p>
                <p className="text-sm text-gray-600 mt-1">Settings → Permissions → Location → <b>Allow all the time</b>. ("Only while using the app" stops it when the screen is off.)</p>
                <p className="text-sm text-gray-500">সেটিংস → অনুমতি → লোকেশন → <b>সবসময় অনুমতি দিন</b>।</p>
                <button onClick={openLocationSettings} className="mt-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-orange-600">Open settings · সেটিংস খুলুন</button>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <p className="font-semibold text-gray-900 flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-orange-600" /> No battery restriction
                  {batteryOk === true && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Done</span>}
                </p>
                <p className="text-sm text-gray-600 mt-1">Battery → <b>Unrestricted</b> (or "Don't optimise") for Bunny Momos, so Android doesn't stop the check-in. On Xiaomi/Redmi, Vivo, Oppo and Realme also turn on Autostart.</p>
                <p className="text-sm text-gray-500">ব্যাটারি → <b>আনরেস্ট্রিক্টেড</b> বেছে নিন, যাতে অ্যান্ড্রয়েড চেক-ইন বন্ধ না করে।</p>
                {riderAlertSupported() && (
                  <button onClick={() => openRiderAlertSetting.battery()} className="mt-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-orange-600">Open battery settings · ব্যাটারি সেটিংস</button>
                )}
              </div>
            </div>
            <button onClick={() => onClose(true)} className="mt-5 w-full px-4 py-3 rounded-xl bg-gray-900 text-white font-semibold">Done · হয়ে গেছে</button>
          </>
        )}
      </div>
    </div>
  );
}

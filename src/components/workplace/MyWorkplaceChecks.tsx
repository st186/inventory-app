import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Loader2, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getTodayIST } from '../../utils/timezone';
import { getMyChecks, rescorePhoto, uploadPhoto, type MyCheck, type MyChecks } from './workplaceApi';
import { AuthedPhoto } from './AuthedPhoto';
import { bnDigits, compressPhoto, fmt12, liveStatus, minToTime, nowMinutesIST, scoreCls, statusMeta, timeOfIso, toMin } from './workplaceUtils';

// "My workplace checks": today's areas assigned to the signed-in person, each with a camera button.
// Uploads go one at a time so two quick taps can't overwrite each other's record on the server.
export function MyWorkplaceChecks({ threshold }: { threshold: number }) {
  const [data, setData] = useState<MyChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const load = async () => {
    setLoading(true);
    try { setData(await getMyChecks()); } catch (e: any) { toast.error(e?.message || 'Could not load your checks'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Statuses move with the clock (due -> late) without reloading.
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  const today = getTodayIST();
  const nowMin = nowMinutesIST();
  const early = data?.earlyMinutes ?? 30;
  const items = (data?.items || []).map((it) => ({ ...it, status: liveStatus(data!.date, today, nowMin, it.start, it.end, it.hasPhoto, it.late) }));
  const done = items.filter((i) => i.hasPhoto).length;

  const replace = (id: string, patch: Partial<MyCheck>) => setData((d) => d && { ...d, items: d.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  const take = async (it: MyCheck, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy(it.id);
    try {
      const { image, thumb } = await compressPhoto(file);
      const res = await uploadPhoto({ itemId: it.id, image, thumb });
      replace(it.id, res.item);
      if (res.item.aiVerdict === 'unclear_photo') toast.warning('Photo unclear - take it again · ছবি পরিষ্কার নয়, আবার তুলুন');
      else if (res.flagged) toast.error(`Needs cleaning (score ${res.item.aiScore}/10) - clean and retake · আবার পরিষ্কার করে ছবি দিন`);
      else toast.success('Photo sent · ছবি পাঠানো হয়েছে');
    } catch (err: any) {
      toast.error(err?.message || 'Could not send the photo');
    } finally {
      setBusy(null);
    }
  };

  const retryScore = async (it: MyCheck) => {
    if (!data?.employeeId || busy) return;
    setBusy(it.id);
    try {
      const res = await rescorePhoto({ date: data.date, employeeId: data.employeeId, itemId: it.id });
      replace(it.id, res);
      if (!res.success) toast.error('Still could not score it - try later · পরে আবার চেষ্টা করুন');
    } catch (err: any) {
      toast.error(err?.message || 'Could not score the photo');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">Today's photos · আজকের ছবি</p>
          {items.length > 0 && (
            <p className="text-sm text-gray-600">{done} of {items.length} done · {bnDigits(String(items.length))}টার মধ্যে {bnDigits(String(done))}টা হয়েছে</p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-gray-200 bg-white" aria-label="Refresh">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="py-12 flex justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !items.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
          <p>No workplace photos for you today.</p>
          <p className="text-sm">আজ আপনার কোনো ছবি দেওয়ার নেই।</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const meta = statusMeta(it.status, it.start, it.end);
            const opensAt = it.start ? Math.max(0, toMin(it.start) - early) : 0;
            const notOpen = it.start && nowMin < opensAt && !it.hasPhoto;
            const flagged = it.flag?.status === 'needs_cleaning';
            return (
              <li key={it.id} className={`rounded-xl border bg-white p-3 shadow-sm ${flagged ? 'border-red-300' : 'border-gray-200'}`}>
                <div className="flex gap-3">
                  {it.hasPhoto && data?.employeeId ? (
                    <AuthedPhoto date={data.date} employeeId={data.employeeId} itemId={it.id} thumb version={it.uploadedAt} className="w-20 h-20 rounded-lg flex-shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-lg bg-orange-50 border border-dashed border-orange-200 flex items-center justify-center flex-shrink-0">
                      <Camera className="w-7 h-7 text-orange-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 leading-tight">{it.name}</p>
                    {it.nameBn && <p className="text-sm text-gray-700 leading-tight">{it.nameBn}</p>}
                    {it.hint && <p className="text-xs text-gray-500 mt-0.5">{it.hint}</p>}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                      {it.hasPhoto && it.uploadedAt && <span className="text-[11px] text-gray-500">{timeOfIso(it.uploadedAt)}</span>}
                      {it.aiStatus === 'scored' && typeof it.aiScore === 'number' && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${scoreCls(it.aiScore, threshold)}`}>
                          <Sparkles className="w-3 h-3" /> {it.aiScore}/10
                        </span>
                      )}
                      {it.locationName && <span className="text-[11px] text-gray-400">{it.locationName}</span>}
                    </div>
                  </div>
                </div>

                {it.aiStatus === 'scored' && it.aiVerdict === 'unclear_photo' && (
                  <p className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Photo unclear - take it again so the whole area shows. · ছবি পরিষ্কার নয়, পুরো জায়গা দেখিয়ে আবার তুলুন।</p>
                )}
                {it.aiStatus === 'scored' && it.aiVerdict !== 'unclear_photo' && (it.aiIssuesBengali?.length || it.aiIssues?.length) ? (
                  <div className="mt-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    {it.aiIssuesBengali?.length ? <p className="text-gray-900">{it.aiIssuesBengali.join(' · ')}</p> : null}
                    {it.aiIssues?.length ? <p className="text-xs text-gray-500">{it.aiIssues.join(' · ')}</p> : null}
                  </div>
                ) : null}
                {it.aiStatus === 'failed' && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-gray-700">Not scored yet · স্কোর হয়নি</span>
                    <button onClick={() => retryScore(it)} disabled={!!busy} className="inline-flex items-center gap-1 text-orange-700 font-semibold disabled:opacity-50">
                      <RotateCcw className="w-4 h-4" /> Retry · আবার
                    </button>
                  </div>
                )}
                {it.flag && (
                  <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${flagged ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>
                    <p className="font-semibold inline-flex items-center gap-1">
                      {flagged ? <><AlertTriangle className="w-4 h-4" /> Clean again · আবার পরিষ্কার করুন</> : <><CheckCircle2 className="w-4 h-4" /> Checked OK · ঠিক আছে</>}
                    </p>
                    {it.flag.note && !it.flag.auto && <p className="mt-0.5">{it.flag.note}</p>}
                    {flagged && it.flag.fixedAt && <p className="text-xs mt-0.5">New photo sent - waiting for a check · নতুন ছবি পাঠানো হয়েছে</p>}
                  </div>
                )}

                <label className={`mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${
                  notOpen || busy ? 'bg-gray-100 text-gray-400' : it.hasPhoto ? 'bg-white border-2 border-orange-300 text-orange-700' : 'bg-orange-600 text-white'
                } ${notOpen || busy ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  {busy === it.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending… · পাঠানো হচ্ছে</>
                    : notOpen ? <>Opens at {fmt12(minToTime(opensAt))} · {bnDigits(fmt12(minToTime(opensAt)))} থেকে</>
                    : <><Camera className="w-4 h-4" /> {it.hasPhoto ? 'Retake · আবার তুলুন' : 'Take photo · ছবি তুলুন'}</>}
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!notOpen || !!busy} onChange={(e) => take(it, e)} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

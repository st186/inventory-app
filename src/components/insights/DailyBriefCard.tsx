import { useEffect, useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../../utils/api';

const HEADINGS = ['yesterday', 'this week', 'do today', 'watch'];

// Renders the brief's plain-text headings and bullet lines.
function BriefText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm text-gray-800">
      {text.split('\n').map((raw, i) => {
        const line = raw.replace(/\*\*/g, '').trim();
        if (!line) return null;
        const bare = line.replace(/^#+\s*/, '').replace(/:$/, '');
        if (HEADINGS.includes(bare.toLowerCase())) return <p key={i} className="pt-2 first:pt-0 text-xs font-bold uppercase tracking-wide text-violet-700">{bare}</p>;
        const bullet = line.match(/^[-•*]\s+(.*)$/);
        return bullet
          ? <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-1 before:text-violet-400">{bullet[1]}</p>
          : <p key={i}>{line}</p>;
      })}
    </div>
  );
}

// Today's brief, written by Claude once a day from the forecast, yesterday's result, the
// festival calendar, wastage and stock-outs.
export function DailyBriefCard({ accessToken, storeId, canManage }: { accessToken: string; storeId: string | null; canManage: boolean }) {
  const [brief, setBrief] = useState<api.AiBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getAiBrief(accessToken, storeId, false)
      .then((r) => { if (!cancelled) setBrief(r.brief); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load the brief'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, storeId]);

  const write = async (refresh: boolean) => {
    setWriting(true);
    setError(null);
    try {
      const r = await api.getAiBrief(accessToken, storeId, refresh);
      setBrief(r.brief);
      if (r.note) toast.info(r.note);
    } catch (e: any) {
      setError(e?.message || 'Could not write the brief');
    } finally {
      setWriting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-violet-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-gray-900">Today's brief</h3>
            <p className="text-xs text-gray-500">{brief ? `Written ${new Date(brief.generatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} by AI from your numbers` : 'What happened, what is coming, what to do'}</p>
          </div>
        </div>
        {brief && canManage && (
          <button onClick={() => write(true)} disabled={writing} className="p-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50" aria-label="Write a fresh brief" title="Write a fresh brief">
            <RefreshCw className={`w-4 h-4 ${writing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : error ? (
        <p className="text-sm text-rose-700 bg-rose-50 rounded-lg p-3">{error}</p>
      ) : writing ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-violet-700"><Loader2 className="w-4 h-4 animate-spin" /> Reading the numbers and writing today's brief...</div>
      ) : brief ? (
        <BriefText text={brief.text} />
      ) : canManage ? (
        <button onClick={() => write(false)} className="w-full px-4 py-3 rounded-lg bg-violet-600 text-white font-semibold inline-flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4" /> Write today's brief
        </button>
      ) : (
        <p className="text-sm text-gray-500">Today's brief hasn't been written yet.</p>
      )}
    </div>
  );
}

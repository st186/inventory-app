import { useEffect, useState } from 'react';
import { Lightbulb, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../../utils/api';

const STATUS: { id: api.GrowthIdea['status']; label: string; chip: string }[] = [
  { id: 'new', label: 'New', chip: 'bg-violet-100 text-violet-800' },
  { id: 'trying', label: 'Trying', chip: 'bg-sky-100 text-sky-800' },
  { id: 'done', label: 'Done', chip: 'bg-emerald-100 text-emerald-800' },
  { id: 'dropped', label: 'Dropped', chip: 'bg-gray-100 text-gray-500' },
];

// AI growth ideas grounded in the store's own numbers. The owner marks each one as trying,
// done or dropped, and the next round of ideas takes that into account.
export function GrowthIdeas({ accessToken, storeId, canManage }: { accessToken: string; storeId: string | null; canManage: boolean }) {
  const [ideas, setIdeas] = useState<api.GrowthIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDropped, setShowDropped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getGrowthIdeas(accessToken, storeId)
      .then((list) => { if (!cancelled) setIdeas(list); })
      .catch(() => { /* empty list is fine */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, storeId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const fresh = await api.generateGrowthIdeas(accessToken, storeId);
      setIdeas((prev) => [...fresh, ...prev]);
      toast.success(`${fresh.length} new ideas`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not get ideas');
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (idea: api.GrowthIdea, status: api.GrowthIdea['status']) => {
    try {
      const updated = await api.updateGrowthIdea(accessToken, idea.storeId, idea.id, status);
      setIdeas((prev) => prev.map((x) => (x.id === idea.id ? updated : x)));
    } catch (e: any) {
      toast.error(e?.message || 'Could not update');
    }
  };

  const visible = ideas.filter((i) => showDropped || i.status !== 'dropped');

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center flex-shrink-0"><Lightbulb className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-gray-900">Growth ideas</h3>
            <p className="text-xs text-gray-500">From your weekday pattern, item mix, festivals, wastage and stock-outs - counter first</p>
          </div>
        </div>
        {canManage && (
          <button onClick={generate} disabled={generating} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {generating ? 'Thinking it through...' : "Get this week's ideas"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">No ideas yet{canManage ? ' - press "Get this week\'s ideas".' : '.'}</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((idea) => {
            const st = STATUS.find((s) => s.id === idea.status) || STATUS[0];
            return (
              <li key={idea.id} className={`rounded-lg border p-3 ${idea.status === 'dropped' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{idea.title}</p>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${st.chip}`}>{st.label}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 capitalize">{idea.category} · {idea.effort} effort · {new Date(idea.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                <p className="text-sm text-gray-700 mt-2"><span className="font-semibold">Why:</span> {idea.why}</p>
                <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Do:</span> {idea.action}</p>
                <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Expected:</span> {idea.expectedImpact}</p>
                {canManage && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {STATUS.filter((s) => s.id !== 'new' && s.id !== idea.status).map((s) => (
                      <button key={s.id} onClick={() => setStatus(idea, s.id)} className="px-2.5 py-1 rounded-full border border-gray-300 text-xs text-gray-700 hover:bg-gray-50">{s.label}</button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ideas.some((i) => i.status === 'dropped') && (
        <button onClick={() => setShowDropped((v) => !v)} className="mt-3 text-xs text-gray-500 underline">{showDropped ? 'Hide dropped ideas' : 'Show dropped ideas'}</button>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { getAccess, type WorkplaceAccess } from './workplaceApi';
import { MyWorkplaceChecks } from './MyWorkplaceChecks';
import { WorkplaceReview } from './WorkplaceReview';
import { WorkplaceSetup } from './WorkplaceSetup';

type Tab = 'mine' | 'review' | 'setup';

// Workplace checks: photo proof that each area is clean (server workplace.ts). Everyone has "My
// checks"; the owner, operations managers and each place's incharge also get Review, and the owner
// and operations managers Setup. The server decides who sees which place.
// initialTab / initialLocation come from a notification ("store:STORE-1" style relatedId).
export function WorkplaceChecks({ initialTab, initialLocation }: { initialTab?: string | null; initialLocation?: string | null }) {
  const [access, setAccess] = useState<WorkplaceAccess | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    getAccess()
      .then(setAccess)
      .catch(() => setAccess({ canSetup: false, locations: [], settings: { aiEnabled: true, aiThreshold: 6 } }));
  }, []);

  const canReview = !!access?.locations.length;
  const canSetup = !!access?.canSetup;

  // Pick the tab once access is known: the asked-for one if allowed, else review for the owner
  // side and "my checks" for everyone else.
  useEffect(() => {
    if (!access) return;
    const wanted = initialTab === 'review' || initialTab === 'setup' || initialTab === 'mine' ? initialTab : null;
    const allowed = (t: Tab | null) => t === 'mine' || (t === 'review' && canReview) || (t === 'setup' && canSetup);
    setTab(allowed(wanted) ? wanted : canSetup ? 'review' : 'mine');
  }, [access, initialTab, canReview, canSetup]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'My checks · আমার' },
    ...(canReview ? [{ id: 'review' as Tab, label: 'Review' }] : []),
    ...(canSetup ? [{ id: 'setup' as Tab, label: 'Setup' }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><ClipboardCheck className="w-6 h-6 text-orange-600" /> Workplace checks</h1>
        <p className="text-sm text-gray-500">Daily photos showing every area is clean · প্রতিদিন পরিষ্কারের ছবি</p>
      </div>

      {!access || !tab ? (
        <div className="py-12 flex justify-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {tabs.length > 1 && (
            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-full sm:w-auto sm:inline-flex">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold ${tab === t.id ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-600'}`}>{t.label}</button>
              ))}
            </div>
          )}
          {tab === 'mine' && <MyWorkplaceChecks threshold={access.settings.aiThreshold} />}
          {tab === 'review' && canReview && <WorkplaceReview locations={access.locations} threshold={access.settings.aiThreshold} initialLocation={initialLocation} />}
          {tab === 'setup' && canSetup && <WorkplaceSetup access={access} onSettings={(settings) => setAccess({ ...access, settings })} />}
        </>
      )}
    </div>
  );
}

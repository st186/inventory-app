import { useEffect, useState } from 'react';
import { SegmentedControl } from '../ui/segmented-control';
import { Skeleton, SkeletonListRows } from '../ui/skeleton';
import { useT } from '../../utils/i18n';
import type { WorkplaceAccess } from './workplaceApi';
import { MyWorkplaceChecks } from './MyWorkplaceChecks';
import { WorkplaceReview } from './WorkplaceReview';
import { WorkplaceSetup } from './WorkplaceSetup';
import { TeamPage } from '../team/shared';
import { teamWorkplaceApi } from '../team/teamApi';

type Tab = 'mine' | 'review' | 'setup';

// Workplace checks: photo proof that each area is clean (server workplace.ts). Everyone has "My
// checks"; the owner, operations managers and each place's incharge also get Review, and the owner
// and operations managers Setup. The server decides who sees which place. The shell opens this on
// the right part (Team → Checks = review, Me → Workplace photos = mine, Setup = setup).
// initialTab / initialLocation come from a notification ("store:STORE-1" style relatedId).
export function WorkplaceChecks({ initialTab, initialLocation }: { initialTab?: string | null; initialLocation?: string | null }) {
  const { t } = useT();
  const [access, setAccess] = useState<WorkplaceAccess | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    teamWorkplaceApi
      .getAccess()
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
    const allowed = (x: Tab | null) => x === 'mine' || (x === 'review' && canReview) || (x === 'setup' && canSetup);
    setTab(allowed(wanted) ? wanted : canSetup ? 'review' : 'mine');
  }, [access, initialTab, canReview, canSetup]);

  const tabs: { value: Tab; label: string }[] = [
    ...(canReview ? [{ value: 'review' as Tab, label: t('team.check.review') }] : []),
    { value: 'mine', label: t('team.check.mine') },
    ...(canSetup ? [{ value: 'setup' as Tab, label: t('team.check.setup') }] : []),
  ];

  return (
    <TeamPage>
      {!access || !tab ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <SkeletonListRows count={4} />
        </div>
      ) : (
        <>
          {tabs.length > 1 && <SegmentedControl aria-label={t('more.myChecks')} value={tab} onValueChange={setTab} options={tabs} />}
          {tab === 'mine' && <MyWorkplaceChecks threshold={access.settings.aiThreshold} />}
          {tab === 'review' && canReview && <WorkplaceReview locations={access.locations} threshold={access.settings.aiThreshold} initialLocation={initialLocation} canSetup={access.canSetup} />}
          {tab === 'setup' && canSetup && <WorkplaceSetup access={access} onSettings={(settings) => setAccess({ ...access, settings })} />}
        </>
      )}
    </TeamPage>
  );
}

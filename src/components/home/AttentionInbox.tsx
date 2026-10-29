// "Needs your attention" (design review d2): up to five things waiting for the owner or operations
// manager, each opening the screen where it's done, with "See all (n)" for the rest.
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CheckCircle2 } from 'lucide-react';
import { ListGroup, ListRow, type IconWellTone } from '../ui/list-row';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { SkeletonListRows } from '../ui/skeleton';
import { ResponsiveModal } from '../ui/responsive-modal';
import { useT } from '../../utils/i18n';

export type AttentionItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  meta?: string;
  /** Shown as a chip on the right. */
  count?: number;
  /** Danger for money and stock-outs; neutral otherwise. */
  tone?: 'neutral' | 'danger' | 'warning';
  /** Lower comes first. */
  rank: number;
  onOpen: () => void;
};

// Neutral rows take their icon's pastel (ui/tints.ts); danger and warning keep the status colour.
const WELL: Record<NonNullable<AttentionItem['tone']>, IconWellTone | undefined> = { neutral: undefined, danger: 'danger', warning: 'warning' };
const CHIP: Record<NonNullable<AttentionItem['tone']>, StatusTone> = { neutral: 'neutral', danger: 'danger', warning: 'warning' };
const MAX_ROWS = 5;

function Row({ item, onOpen }: { item: AttentionItem; onOpen: () => void }) {
  const tone = item.tone ?? 'neutral';
  return (
    <ListRow
      icon={item.icon}
      iconTone={WELL[tone]}
      title={item.title}
      subtitle={item.meta}
      trailing={item.count !== undefined ? <StatusChip tone={CHIP[tone]}><span className="num">{item.count}</span></StatusChip> : undefined}
      chevron
      onClick={onOpen}
    />
  );
}

export function AttentionInbox({ items, loading, title }: { items: AttentionItem[]; loading?: boolean; title?: string }) {
  const { t } = useT();
  const [allOpen, setAllOpen] = useState(false);
  const sorted = [...items].sort((a, b) => a.rank - b.rank);
  const shown = sorted.slice(0, MAX_ROWS);
  const openFromSheet = (item: AttentionItem) => {
    setAllOpen(false);
    item.onOpen();
  };
  return (
    <>
      <ListGroup
        id="home-attention"
        title={title ?? t('home.needsAttention')}
        action={sorted.length > MAX_ROWS ? (
          <Button variant="link" size="sm" onClick={() => setAllOpen(true)}>{t('common.seeAll', { n: sorted.length })}</Button>
        ) : undefined}
        empty={loading ? <SkeletonListRows count={3} /> : <EmptyState compact icon={CheckCircle2} title={t('empty.allCaughtUp')} />}
      >
        {shown.map((item) => <Row key={item.key} item={item} onOpen={item.onOpen} />)}
      </ListGroup>
      <ResponsiveModal open={allOpen} onOpenChange={setAllOpen} title={t('home.seeAllTitle')} size="detail" bodyClassName="px-0">
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-border">
          {sorted.map((item) => <Row key={item.key} item={item} onOpen={() => openFromSheet(item)} />)}
        </div>
      </ResponsiveModal>
    </>
  );
}

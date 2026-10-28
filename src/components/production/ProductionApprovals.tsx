// Production days waiting for approval (operations manager / cluster head): a list of days, and
// a sheet with the day's pieces per type and a sticky Approve.
import { useState } from 'react';
import { CheckCircle2, CheckSquare, Factory } from 'lucide-react';
import type { InventoryContextType, ProductionData } from '../../App';
import { toast } from '../ui/sonner';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatGrid, StatTile } from '../ui/stat-tile';
import { StatusChip } from '../ui/status-chip';
import { MOMO_TYPES } from '../../constants/momoTypes';
import { useT } from '../../utils/i18n';
import { dayLabel, formatCount, momoName } from '../stock/stockShared';

type Props = {
  context: InventoryContextType;
  isPendingForViewer: (p: ProductionData) => boolean;
};

const piecesOf = (p: ProductionData) =>
  p.chickenMomos.final + p.chickenCheeseMomos.final + p.vegMomos.final + p.cheeseCornMomos.final + p.paneerMomos.final + p.vegKurkureMomos.final + p.chickenKurkureMomos.final;
const wastageOf = (p: ProductionData) => p.wastage.dough + p.wastage.stuffing + p.wastage.batter + p.wastage.coating;

export function ProductionApprovals({ context, isPendingForViewer }: Props) {
  const { t, lang } = useT();
  // One approval at a time, so a double tap can't send the same approval twice.
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const pendingProduction = context.productionData
    .filter(isPendingForViewer)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const open = pendingProduction.find((p) => p.id === openId) || null;
  const houseName = (p: ProductionData) => context.productionHouses?.find((h) => h.id === (p.productionHouseId || p.storeId))?.name || '';

  const approve = async (production: ProductionData) => {
    if (approvingId) return;
    setApprovingId(production.id);
    try {
      await context.approveProductionData(production.id);
      toast.success('Production approved');
      setOpenId(null);
    } catch (error) {
      toast.error("Couldn't approve. Try again.");
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <>
      <ListGroup
        title="Waiting for approval"
        meta={pendingProduction.length ? String(pendingProduction.length) : undefined}
        empty={<EmptyState icon={CheckCircle2} title={t('empty.allCaughtUp')} body="No production days are waiting for approval." />}
      >
        {pendingProduction.map((production) => (
          <ListRow
            key={production.id}
            icon={Factory}
            title={dayLabel(lang, production.date)}
            subtitle={[houseName(production), `${formatCount(piecesOf(production))} pcs`, `${wastageOf(production).toFixed(2)} kg wasted`, `by ${production.createdBy}`].filter(Boolean).join(' · ')}
            trailing={<StatusChip status="approval.pending" />}
            onClick={() => setOpenId(production.id)}
          />
        ))}
      </ListGroup>

      <ResponsiveModal
        open={!!open}
        onOpenChange={(o) => { if (!o) setOpenId(null); }}
        title={open ? dayLabel(lang, open.date) : ''}
        description={open ? [houseName(open), `Sent by ${open.createdBy}`].filter(Boolean).join(' · ') : undefined}
        size="detail"
        footer={open ? (
          <Button size="lg" className="flex-1" leadingIcon={<CheckSquare />} loading={approvingId === open.id} disabled={approvingId !== null && approvingId !== open.id} onClick={() => approve(open)}>
            Approve
          </Button>
        ) : undefined}
      >
        {open && (
          <div className="flex flex-col gap-5">
            <StatGrid>
              <StatTile label="Pieces made" value={<span className="num">{formatCount(piecesOf(open))}</span>} />
              <StatTile label="Wastage" value={<span className="num">{wastageOf(open).toFixed(2)} kg</span>} />
              <StatTile label="Kurkure" value={<span className="num">{formatCount(open.vegKurkureMomos.final + open.chickenKurkureMomos.final)}</span>} />
              <StatTile label="Regular momos" value={<span className="num">{formatCount(open.chickenMomos.final + open.chickenCheeseMomos.final + open.vegMomos.final + open.cheeseCornMomos.final + open.paneerMomos.final)}</span>} />
            </StatGrid>
            <ListGroup overline="Pieces by type">
              {MOMO_TYPES.filter((m) => (open as any)[m.key]?.final > 0).map((m) => (
                <ListRow key={m.key} density="compact" title={momoName(lang, m.inventoryKey, m.label)} trailing={<span className="num text-body-md font-semibold text-text">{formatCount((open as any)[m.key].final)}</span>} />
              ))}
            </ListGroup>
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}

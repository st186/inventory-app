// Production entries to check (owner, 28 Oct 2026): what the server's checks found in a day's
// production - two entries for one day, a day far above or below usual, pieces that don't match
// the stuffing logged, a sauce weight with a slipped decimal, a lot written off, an entry made
// days later - plus anything else Bunny found odd against the last two weeks. Each card says
// what looks wrong; fix the entry (an edit that clears it closes the card) or mark it checked.
// The owner and operations managers see every house, a production incharge their own (server
// productionReview.ts).
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Factory, Sparkles } from 'lucide-react';
import * as api from '../../utils/api';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ResponsiveModal } from '../ui/responsive-modal';
import { StatusChip } from '../ui/status-chip';
import { toast } from '../ui/sonner';

export function useProductionFlags(enabled: boolean, accessToken?: string) {
  const [flags, setFlags] = React.useState<api.ProductionFlag[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const reload = React.useCallback(() => {
    if (!enabled) return;
    api.getProductionFlags(accessToken).then((list) => { setFlags(list); setLoaded(true); }).catch(() => setLoaded(true));
  }, [enabled, accessToken]);
  React.useEffect(() => { reload(); }, [reload]);
  return { flags, loaded, reload };
}

const entryLine = (f: api.ProductionFlag) => [
  new Date(`${f.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  f.entry ? `${f.entry.pieces.toLocaleString('en-IN')} pieces` : '',
  f.entry?.approvalStatus === 'pending' ? 'waiting for approval' : '',
  f.loggedBy ? `by ${f.loggedBy}` : '',
].filter(Boolean).join(' · ');

function FlagCard({ flag, onDone }: { flag: api.ProductionFlag; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const checked = async () => {
    setBusy(true);
    try {
      await api.dismissProductionFlag(flag.id);
      toast.success('Marked as checked');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-body-md font-semibold text-text">{flag.title}</span>
        {flag.byAi
          ? <StatusChip tone="info" icon={Sparkles}>Bunny</StatusChip>
          : <StatusChip tone="warning" icon={AlertTriangle}>Check</StatusChip>}
      </div>
      <p className="num text-label text-text-3">{entryLine(flag)}</p>
      <p className="text-body-sm text-text-2">{flag.message}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="secondary" leadingIcon={<CheckCircle2 />} loading={busy} onClick={checked}>Checked, it's right</Button>
      </div>
    </div>
  );
}

export function ProductionFlagsSheet({ open, onOpenChange, flags, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flags: api.ProductionFlag[];
  onChanged: () => void;
}) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Production entries to check"
      description="Bunny checks every production entry when it's saved. Fix the entry if something is wrong, or mark it checked."
      size="detail"
    >
      {flags.length === 0 ? (
        <EmptyState compact icon={CheckCircle2} title="Nothing to check" body="Entries are checked as they are saved." />
      ) : (
        <div className="flex flex-col gap-3">
          {flags.map((f) => <FlagCard key={f.id} flag={f} onDone={onChanged} />)}
        </div>
      )}
    </ResponsiveModal>
  );
}

/** The banner on the production screen, and the sheet it opens. */
export function ProductionFlagsBanner({ enabled, accessToken }: { enabled: boolean; accessToken?: string }) {
  const { flags, reload } = useProductionFlags(enabled, accessToken);
  const [open, setOpen] = React.useState(false);
  if (!enabled || flags.length === 0) return null;
  return (
    <>
      <Callout
        tone="warning"
        icon={Factory}
        title={flags.length === 1 ? '1 production entry to check' : `${flags.length} production entries to check`}
        action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Review</Button>}
      >
        {flags.slice(0, 2).map((f) => f.title).join(' · ')}{flags.length > 2 ? ' · …' : ''}
      </Callout>
      <ProductionFlagsSheet open={open} onOpenChange={setOpen} flags={flags} onChanged={reload} />
    </>
  );
}

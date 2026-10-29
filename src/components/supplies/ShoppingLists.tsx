// Shopping lists under More, for the owner and operations (owner, 29 Oct 2026: "where can I check
// that the list was sent to Vijay and to the vendors, at what time, and the list"). Read-only: each
// list's timeline - written, sent, reached the shopper (after their quiet hours), opened, each
// vendor's WhatsApp, the shopping ticked off, the bill photos, the prices into the expenses - and
// the list itself with what was got. Lists are written and priced from the Shopping card on Home.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock3, XCircle } from 'lucide-react';
import { useShell } from '../shell/ShellContext';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { ListGroup, ListRow } from '../ui/list-row';
import { formatINR } from '../ui/money';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import { qtyLabel } from './quantityNorms';
import { BillThumb, STATUS } from './Shopping';
import { orderSig, vendorProgress } from './Vendors';
import * as api from './suppliesApi';

const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const timeOnly = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const first = (xs: (string | undefined | null)[]) => xs.filter((x): x is string => !!x).sort()[0] || null;

export function ShoppingListsScreen() {
  const [days, setDays] = useState('7');
  const [data, setData] = useState<api.Lists | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(false);
    api.listShopping(Number(days)).then(setData).catch(() => setError(true));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  const open = data?.lists.find((l) => l.id === openId) || null;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">
      <p className="text-body-sm text-text-2">Every shopping list: when it was sent, when it reached the shopper and the vendors, what was got, and when it went into the expenses. Lists are written and priced from the Shopping card on Home.</p>
      <SegmentedControl aria-label="How far back" value={days} onValueChange={setDays}
        options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      {error ? <ErrorState onRetry={load} /> : !data ? <p className="text-body-sm text-text-3">…</p> : !data.lists.length ? (
        <EmptyState title="No shopping lists yet" body="Lists Aniket writes and sends show here." />
      ) : (
        <ListGroup>
          {data.lists.map((l) => (
            <ListRow key={l.id} title={`${dayLabel(l.date)} · ${l.assigneeName}`} subtitle={rowSubtitle(l)} onClick={() => setOpenId(l.id)}
              trailing={<StatusChip tone={STATUS[l.status].tone} size="sm">{STATUS[l.status].label}</StatusChip>} />
          ))}
        </ListGroup>
      )}
      {open && <ListTimeline list={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function rowSubtitle(l: api.ShoppingList) {
  const p = l.progress;
  const v = vendorProgress(l);
  return [
    l.sentAt ? `Sent ${when(l.sentAt)}` : 'Not sent yet',
    v.total ? `vendors ${v.sent} of ${v.total}` : null,
    l.status === 'shopping' || l.status === 'bought' || l.status === 'logged' ? `${p.got} of ${p.total} got${p.missing ? `, ${p.missing} not found` : ''}` : `${p.total} items`,
    `by ${l.createdByName}`,
  ].filter(Boolean).join(' · ');
}

type Step = { title: string; at?: string | null; detail?: string; state: 'done' | 'waiting' | 'missed' };

function ListTimeline({ list, onClose }: { list: api.ShoppingList; onClose: () => void }) {
  const { context } = useShell();
  const [open, setOpen] = useState(true);
  const [seen, setSeen] = useState<{ reachedAt: string | null; seenAt: string | null } | null>(null);
  useEffect(() => { api.listSeen(list.id).then(setSeen).catch(() => setSeen({ reachedAt: null, seenAt: null })); }, [list.id]);
  const who = list.assigneeName.split(' ')[0];
  const p = list.progress;

  // Each vendor on the list and its WhatsApp.
  const vendors = [...new Map(list.lines.filter((l) => l.vendorId).map((l) => [l.vendorId!, l.vendorName || 'Vendor'])).entries()];
  const shopStart = first(list.lines.flatMap((l) => [l.got?.at, l.missingAt]));
  // What the lines came to in the expenses (each logged line points at its expense).
  const spent = list.lines.reduce((s, l) => {
    if (!l.logged) return s;
    const rows: any[] = l.logged.kind === 'overhead' ? context.overheads || [] : context.inventory || [];
    const e = rows.find((r) => r.id === l.logged!.id);
    return s + (Number(e?.totalCost ?? e?.amount) || 0);
  }, 0);

  const steps: Step[] = [
    { title: `Written by ${list.createdByName}`, at: list.createdAt, state: 'done' },
    list.sentAt
      ? { title: `Sent to ${list.assigneeName}`, at: list.sentAt, state: 'done' }
      : { title: `Not sent to ${who} yet`, detail: 'Still a draft.', state: 'waiting' },
  ];
  if (list.sentAt) {
    const reached = list.notifiedAt || seen?.reachedAt;
    steps.push(reached
      ? { title: `Reached ${who}'s phone`, at: reached, detail: list.notifyAt && list.notifyAt > list.sentAt ? 'Held until their quiet hours ended.' : undefined, state: 'done' }
      : { title: `Reaches ${who} at ${timeOnly(list.notifyAt)}`, detail: 'Held until their quiet hours end.', state: 'waiting' });
    steps.push(seen?.seenAt
      ? { title: `${who} opened it`, at: seen.seenAt, state: 'done' }
      : { title: `${who} hasn't opened the notification`, detail: seen ? 'They may have gone to the list from Home instead.' : undefined, state: 'waiting' });
  }
  for (const [id, name] of vendors) {
    const rec = list.vendorOrders?.[id];
    const changed = !!rec && rec.sig !== orderSig(list.lines.filter((l) => l.vendorId === id));
    steps.push(rec
      ? { title: `${name}: sent on WhatsApp`, at: rec.at, detail: `By ${rec.byName}${changed ? '. The list changed after it was sent - the vendor may have the old one.' : ''}`, state: changed ? 'missed' : 'done' }
      : { title: `${name}: not sent on WhatsApp`, detail: list.status === 'draft' ? undefined : 'Their part may have been ordered another way.', state: list.status === 'draft' ? 'waiting' : 'missed' });
  }
  if (list.sentAt) {
    steps.push(shopStart
      ? { title: `${who} started ticking off`, at: shopStart, detail: `${p.got} of ${p.total} got${p.missing ? `, ${p.missing} not found` : ''}${p.left ? `, ${p.left} still to mark` : ''}.`, state: 'done' }
      : { title: `${who} hasn't started`, state: 'waiting' });
    steps.push(list.boughtAt
      ? { title: 'Shopping finished', at: list.boughtAt, detail: `${(list.bills || []).length} bill photo${(list.bills || []).length === 1 ? '' : 's'}.`, state: 'done' }
      : { title: 'Shopping not finished', state: 'waiting' });
    steps.push(list.loggedAt
      ? { title: 'Prices set and in the expenses', at: list.loggedAt, detail: spent ? `${formatINR(spent)} in all.` : undefined, state: 'done' }
      : { title: list.status === 'bought' ? `Waiting for ${list.createdByName.split(' ')[0]} to set the prices` : 'Prices not set yet', state: 'waiting' });
  }

  // The list itself, by vendor (then what is bought at the shops).
  const groups = new Map<string, api.ShoppingLine[]>();
  for (const l of [...list.lines].sort((a, b) => Number(!a.vendorName) - Number(!b.vendorName) || (a.vendorName || '').localeCompare(b.vendorName || ''))) {
    const k = l.vendorName ? `From ${l.vendorName}` : 'Other shops';
    groups.set(k, [...(groups.get(k) || []), l]);
  }

  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail"
      title={`Shopping list · ${dayLabel(list.date)}`} description={`For ${list.assigneeName}, written by ${list.createdByName}.`}>
      <div className="flex flex-col gap-5">
        <ol className="flex flex-col">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                {s.state === 'done' ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                  : s.state === 'missed' ? <XCircle className="size-5 shrink-0 text-warning" aria-hidden="true" />
                    : <Circle className="size-5 shrink-0 text-text-3" aria-hidden="true" />}
                {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-border" aria-hidden="true" />}
              </div>
              <div className="flex min-w-0 flex-col pb-3">
                <span className={cn('text-body-sm font-medium', s.state === 'waiting' ? 'text-text-2' : 'text-text')}>{s.title}</span>
                {s.at && <span className="num inline-flex items-center gap-1 text-label text-text-3"><Clock3 className="size-3.5" aria-hidden="true" />{when(s.at)}</span>}
                {s.detail && <span className="text-label text-text-2">{s.detail}</span>}
              </div>
            </li>
          ))}
        </ol>

        {list.note && <p className="text-body-sm text-text-2">Note: &ldquo;{list.note}&rdquo;</p>}

        {[...groups.entries()].map(([title, lines]) => (
          <ListGroup key={title} overline={title}>
            {lines.map((l) => (
              <ListRow key={l.id} title={l.item}
                subtitle={`Asked ${qtyLabel(l)}${l.placeName ? ` · for ${l.placeName}` : ''}`}
                trailing={l.got && l.got.qty > 0
                  ? <span className="num text-right text-label text-success">Got {qtyLabel({ ...l, qty: l.got.qty })}<br /><span className="text-text-3">{timeOnly(l.got.at)}</span></span>
                  : l.missing ? <span className="text-right text-label text-warning">Not found<br /><span className="text-text-3">{timeOnly(l.missingAt)}</span></span>
                    : <span className="text-label text-text-3">-</span>} />
            ))}
          </ListGroup>
        ))}

        {(list.bills || []).length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="overline-label mx-1">Bill photos</p>
            <div className="flex flex-wrap gap-2">{(list.bills || []).map((b) => <BillThumb key={b.path} path={b.path} />)}</div>
          </section>
        )}
      </div>
    </ResponsiveModal>
  );
}

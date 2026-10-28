// "Explain a customer complaint" (anyone the owner asked, complaints.ts): a task on Home until
// they answer, opening a sheet with the complaint, its photos and Bunny's questions.
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Field } from '../ui/field';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Textarea } from '../ui/textarea';
import { toast } from '../ui/sonner';
import * as api from './complaintsApi';

/** Complaints this person was asked about and hasn't answered yet. */
export function useComplaintsToExplain(enabled: boolean) {
  const [items, setItems] = useState<api.Complaint[]>([]);
  const reload = useCallback(() => {
    if (!enabled) return;
    api.listComplaints().then((r) => setItems(r.complaints.filter((c) => c.status !== 'closed' && !!r.me && c.asked.some((p) => p.id === r.me) && !c.explanations[r.me]))).catch(() => undefined);
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { items, reload };
}

/** For the owner and operations managers: complaints to review or decide (Bunny has read it, or everyone asked has answered). */
export function useComplaintsToDecide(enabled: boolean) {
  const [items, setItems] = useState<api.Complaint[]>([]);
  useEffect(() => {
    if (!enabled) return;
    api.listComplaints().then((r) => setItems(r.canManage ? r.complaints.filter((c) => c.status === 'open' || (c.status === 'awaiting' && c.asked.every((p) => c.explanations[p.id]))) : [])).catch(() => undefined);
  }, [enabled]);
  return items;
}

export function ExplainComplaintSheet({ complaint: c, onClose, onDone }: { complaint: api.Complaint | null; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  if (!c) return null;
  const send = async () => {
    if (text.trim().length < 5) { toast.error('Write what happened · কী হয়েছিল লিখুন'); return; }
    setSaving(true);
    try { await api.explain(c.id, text.trim()); toast.success('Sent to the owner'); setText(''); onDone(); onClose(); } catch (e) { toast.error((e as Error).message || 'Could not send it'); } finally { setSaving(false); }
  };
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} size="detail" title={`Customer complaint · ${c.orderDate}`} description={`${api.headline(c)} · ${c.evidence.storeName}`}
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={send}>Send explanation</Button>}>
      <div className="flex flex-col gap-4">
        {c.photoUrls.some(Boolean) && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {c.photoUrls.filter(Boolean).map((u, i) => <img key={i} src={u!} alt={`Complaint photo ${i + 1}`} className="size-24 shrink-0 rounded-md border border-border object-cover" />)}
          </div>
        )}
        {c.customerText && <Callout tone="neutral" title="What the customer said">{c.customerText}</Callout>}
        {c.ai?.summary && <p className="text-body-sm text-text">{c.ai.summary}</p>}
        {c.ai?.questionsForStaff?.length ? (
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-text">Please answer · উত্তর দিন</span>
            <ul className="flex list-disc flex-col gap-0.5 pl-4 text-body-sm text-text-2">{c.ai.questionsForStaff.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>
        ) : null}
        <Field label="What happened · কী হয়েছিল">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1500} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

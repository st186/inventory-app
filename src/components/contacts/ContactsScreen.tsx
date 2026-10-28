// Emergency contacts under More (owner, 29 Oct 2026; server contacts.ts). Everyone can find a number
// and call (or WhatsApp a mobile) in one tap: emergency services, repair people (the technician
// list, shared with repair expenses), helplines, suppliers (the shopping-list vendors and other
// supplier numbers) and anything else. The owner, operations managers and incharges keep it up to
// date; "Worth adding" lists the usual numbers not in it yet.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Pencil, Phone, Plus, Search, Siren } from 'lucide-react';
import { toast } from 'sonner';
import { useT, type I18nKey } from '../../utils/i18n';
import { addTechnician, removeTechnician, updateTechnician } from '../money/paperworkApi';
import { kindLabel, VendorsModal } from '../supplies/Vendors';
import type { VendorKind } from '../supplies/quantityNorms';
import { Button } from '../ui/button';
import { confirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';
import * as api from './contactsApi';

type Kind = 'repairs' | api.ContactKind;
type Editing = { kind: Kind; id?: string; name: string; role: string; phone: string; note: string };

const digits = (p: string) => p.replace(/\D/g, '');
const local = (p: string) => digits(p).replace(/^(91|0)(?=\d{10}$)/, '');
// A number saved with a 0 in front is a landline with its area code: shown as saved, no WhatsApp.
const isMobile = (p: string) => !digits(p).startsWith('0') && /^[6-9]\d{9}$/.test(local(p));
const telHref = (p: string) => (isMobile(p) ? `tel:+91${local(p)}` : `tel:${digits(p)}`);
const phoneText = (p: string) => { const d = local(p); return isMobile(p) ? `${d.slice(0, 5)} ${d.slice(5)}` : digits(p); };

// The usual numbers, offered while they are missing.
const SUGGESTIONS: { label: I18nKey; kind: Kind; name?: string; role: string; has: (d: api.Directory) => boolean }[] = [
  { label: 'contacts.sug.electrician', kind: 'repairs', role: 'Electrician', has: (d) => d.repairs.some((r) => /electric/i.test(`${r.role} ${r.name}`)) },
  { label: 'contacts.sug.plumber', kind: 'repairs', role: 'Plumber', has: (d) => d.repairs.some((r) => /plumb/i.test(`${r.role} ${r.name}`)) },
  { label: 'contacts.sug.mason', kind: 'repairs', role: 'Mason', has: (d) => d.repairs.some((r) => /mason|mistri/i.test(`${r.role} ${r.name}`)) },
  { label: 'contacts.sug.ciferon', kind: 'helpline', name: 'Ciferon', role: 'Helpline', has: (d) => [...d.helplines, ...d.others].some((c) => /ciferon/i.test(`${c.name} ${c.role}`)) },
  { label: 'contacts.sug.zomato', kind: 'helpline', name: 'Zomato', role: 'Restaurant partner helpline', has: (d) => d.helplines.some((c) => /zomato/i.test(`${c.name} ${c.role}`)) },
  { label: 'contacts.sug.swiggy', kind: 'helpline', name: 'Swiggy', role: 'Restaurant partner helpline', has: (d) => d.helplines.some((c) => /swiggy/i.test(`${c.name} ${c.role}`)) },
  { label: 'contacts.sug.packaging', kind: 'supplier', role: 'Packaging', has: (d) => d.suppliers.some((s) => /packag/i.test(`${s.name} ${s.role || ''} ${s.vendorKind || ''}`)) },
];

export function ContactsScreen() {
  const { t } = useT();
  const [data, setData] = useState<api.Directory | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [vendorsOpen, setVendorsOpen] = useState(false);
  const load = useCallback(() => {
    setError(false);
    api.getDirectory().then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const match = useMemo(() => {
    const words = q.trim().toLowerCase();
    const d = digits(q);
    return (e: api.Entry) => !words || `${e.name} ${e.role || ''}`.toLowerCase().includes(words) || (d.length >= 3 && digits(e.phone).includes(d));
  }, [q]);

  if (error) return <Page><ErrorState onRetry={load} /></Page>;
  if (!data) return <Page><p className="text-body-sm text-text-3">…</p></Page>;

  const missing = data.canEdit ? SUGGESTIONS.filter((s) => !s.has(data)) : [];
  const sections: { title: I18nKey; kind: Kind | 'emergency'; rows: (api.Entry & { sub?: string; vendor?: boolean })[] }[] = [
    { title: 'contacts.emergency', kind: 'emergency', rows: data.emergency.map((e) => ({ ...e, sub: e.role })) },
    { title: 'contacts.repairs', kind: 'repairs', rows: data.repairs.map((e) => ({ ...e, sub: e.role })) },
    { title: 'contacts.helplines', kind: 'helpline', rows: data.helplines.map((e) => ({ ...e, sub: [e.role, e.note].filter(Boolean).join(' · ') })) },
    { title: 'contacts.suppliers', kind: 'supplier', rows: data.suppliers.map((e) => ({ ...e, sub: e.vendor ? kindLabel(e.vendorKind as VendorKind) : [e.role, e.note].filter(Boolean).join(' · ') })) },
    { title: 'contacts.others', kind: 'other', rows: data.others.map((e) => ({ ...e, sub: [e.role, e.note].filter(Boolean).join(' · ') })) },
  ];
  const shown = sections.map((s) => ({ ...s, rows: s.rows.filter(match) })).filter((s) => s.rows.length);
  const edit = (kind: Kind, e?: api.Entry & { note?: string; vendor?: boolean }) => {
    if (e?.vendor) { setVendorsOpen(true); return; }
    setEditing({ kind, id: e?.id, name: e?.name || '', role: e?.role || '', phone: e?.phone || '', note: e?.note || '' });
  };

  return (
    <Page>
      <p className="text-body-sm text-text-2">{t('contacts.intro')}</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3" aria-hidden="true" />
        <Input type="search" className="pl-9" value={q} placeholder={t('contacts.search')} aria-label={t('contacts.search')} onChange={(e) => setQ(e.target.value)} />
      </div>
      {data.canEdit && (
        <div className="flex flex-col gap-2">
          <Button leadingIcon={<Plus />} className="self-start" onClick={() => edit('helpline')}>{t('contacts.add')}</Button>
          {missing.length > 0 && !q && (
            <section className="flex flex-col gap-2">
              <p className="overline-label">{t('contacts.worthAdding')}</p>
              <div className="flex flex-wrap gap-2">
                {missing.map((s) => (
                  <button key={s.label} type="button" onClick={() => setEditing({ kind: s.kind, name: s.name || '', role: s.role, phone: '', note: '' })}
                    className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium text-text hover:bg-surface-2">
                    <Plus className="size-3.5 text-text-3" aria-hidden="true" />{t(s.label)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {!shown.length && <EmptyState icon={Search} title={t('contacts.nothing')} />}
      {shown.map((s) => (
        <section key={s.title} className="flex flex-col gap-2">
          <p className="overline-label mx-1">{t(s.title)}</p>
          <ListGroup>
            {s.rows.map((e) => (
              <ListRow key={`${s.kind}:${e.id}`} title={e.name}
                icon={s.kind === 'emergency' ? Siren : undefined} iconTone={s.kind === 'emergency' ? 'danger' : undefined}
                subtitle={[e.sub, e.phone ? phoneText(e.phone) : t('contacts.noPhone')].filter(Boolean).join(' · ')}
                trailing={(
                  <div className="flex items-center gap-1">
                    {e.phone && <IconButton variant="secondary" size="sm" icon={<Phone />} label={t('contacts.call', { name: e.name })} href={telHref(e.phone)} />}
                    {e.phone && isMobile(e.phone) && s.kind !== 'emergency' && (
                      <IconButton variant="ghost" size="sm" icon={<MessageCircle />} label={t('contacts.whatsapp', { name: e.name })} href={`https://wa.me/91${local(e.phone)}`} />
                    )}
                    {s.kind !== 'emergency' && (e.vendor ? data.canManageVendors : data.canEdit) && (
                      <IconButton variant="ghost" size="sm" icon={<Pencil />} label={t('contacts.edit', { name: e.name })} onClick={() => edit(s.kind as Kind, e)} />
                    )}
                  </div>
                )} />
            ))}
          </ListGroup>
          {s.kind === 'repairs' && data.canEdit && <p className="mx-1 text-label text-text-3">{t('contacts.repairsHint')}</p>}
        </section>
      ))}
      {editing && <ContactSheet editing={editing} canRemove={editing.kind === 'repairs' ? data.canRemoveRepairs : true} canAddSupplierVendor={data.canManageVendors}
        onVendors={() => { setEditing(null); setVendorsOpen(true); }} onClose={() => setEditing(null)} onSaved={load} />}
      {vendorsOpen && <VendorsModal onClose={() => { setVendorsOpen(false); load(); }} />}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">{children}</div>;
}

function ContactSheet({ editing, canRemove, canAddSupplierVendor, onVendors, onClose, onSaved }: {
  editing: Editing; canRemove: boolean; canAddSupplierVendor: boolean; onVendors: () => void; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [kind, setKind] = useState<Kind>(editing.kind);
  const [name, setName] = useState(editing.name);
  const [role, setRole] = useState(editing.role);
  const [phone, setPhone] = useState(editing.phone);
  const [note, setNote] = useState(editing.note);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const isNew = !editing.id;
  const save = async () => {
    setBusy('save');
    try {
      if (kind === 'repairs') {
        const body = { name: name.trim(), phone: phone.trim(), trade: role.trim() };
        if (editing.id) await updateTechnician(editing.id, body); else await addTechnician(body);
      } else {
        const body = { kind, name: name.trim(), role: role.trim(), phone: phone.trim(), note: note.trim() };
        if (editing.id) await api.updateContact(editing.id, body); else await api.addContact(body);
      }
      toast.success(t('contacts.saved'));
      onSaved();
      setOpen(false);
    } catch (e) { toast.error((e as Error).message || t('contacts.failed')); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!editing.id) return;
    const ok = await confirm({ title: t('contacts.removeTitle', { name: editing.name }), body: t('contacts.removeBody'), confirmLabel: t('contacts.remove'), tone: 'danger' });
    if (!ok) return;
    setBusy('remove');
    try {
      if (editing.kind === 'repairs') await removeTechnician(editing.id); else await api.removeContact(editing.id);
      toast.success(t('contacts.removed'));
      onSaved();
      setOpen(false);
    } catch (e) { toast.error((e as Error).message || t('contacts.failed')); } finally { setBusy(null); }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail" dirty={isNew && !!(name || phone)}
      title={isNew ? t('contacts.add') : editing.name}
      footer={<Button size="lg" className="flex-1" loading={busy === 'save'} onClick={save}>{t('contacts.save')}</Button>}>
      <div className="flex flex-col gap-4">
        {isNew && (
          <Field label={t('contacts.type')}>
            <SegmentedControl aria-label={t('contacts.type')} value={kind} onValueChange={(v) => setKind(v as Kind)}
              options={[
                { value: 'repairs', label: t('contacts.typeRepairs') }, { value: 'helpline', label: t('contacts.typeHelpline') },
                { value: 'supplier', label: t('contacts.typeSupplier') }, { value: 'other', label: t('contacts.typeOther') },
              ]} />
          </Field>
        )}
        {isNew && kind === 'supplier' && canAddSupplierVendor && (
          <p className="text-label text-text-3">
            {t('contacts.vendorHint')} <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onVendors}>{t('contacts.vendors')}</button>
          </p>
        )}
        <Field label={t('contacts.name')}><Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('contacts.role')}>
          <Input value={role} maxLength={60} placeholder={t(kind === 'repairs' ? 'contacts.roleHintRepairs' : 'contacts.roleHint')} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <Field label={t('contacts.phone')}>
          <Input type="tel" inputMode="tel" className="num" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {kind !== 'repairs' && (
          <Field label={t('contacts.note')} optional>
            <Textarea rows={2} value={note} maxLength={200} placeholder={t('contacts.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {!isNew && canRemove && <Button variant="danger-ghost" loading={busy === 'remove'} onClick={remove}>{t('contacts.remove')}</Button>}
      </div>
    </ResponsiveModal>
  );
}

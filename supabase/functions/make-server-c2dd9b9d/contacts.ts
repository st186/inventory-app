// Emergency contacts (owner, 29 Oct 2026): one directory under More for everyone with a login -
// the national emergency numbers, repair people (the technician list from expensePaperwork.ts, so
// a repair expense can pick the same electrician), helplines (Zomato, Swiggy, the POS company),
// the suppliers (the shopping-list vendors, supplies.ts) and any other number worth having. The
// owner, operations managers and incharges keep it up to date. Registered from kpi.ts.
//
//   contact:{id}   a helpline, supplier (one not ordered from on WhatsApp, e.g. packaging) or other
//                  number: name, what it is for, phone, note
import { P, actorOf, type Actor, type KpiDeps } from './attendance.ts';

export type ContactKind = 'helpline' | 'supplier' | 'other';
type Contact = { id: string; kind: ContactKind; name: string; role: string; phone: string; note?: string; addedBy: string; createdAt: string; updatedAt: string };

// National numbers in India, always at the top (they can't be changed in the app).
const EMERGENCY = [
  { id: 'e112', name: 'All emergencies', role: 'Police, fire and ambulance', phone: '112' },
  { id: 'e100', name: 'Police', role: '', phone: '100' },
  { id: 'e101', name: 'Fire brigade', role: '', phone: '101' },
  { id: 'e108', name: 'Ambulance', role: '', phone: '108' },
];

const contactKey = (id: string) => `contact:${id}`;
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
// Mobiles, landlines and toll-free numbers: digits only, +91 in front of a 10-digit number dropped. A 0
// in front stays (a landline with its area code - the app offers no WhatsApp for it).
const cleanPhone = (v: unknown) => String(v ?? '').replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');
// The owner, operations managers and the store and production incharges.
const canEdit = (a: Actor) => a.isOwner || a.isOps || a.designation === 'store_incharge' || a.designation === 'production_incharge';

export function registerContactRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => { console.log('[contacts]', err?.message || 'error'); return c.json({ error: 'Something went wrong - try again' }, 500); };
  const read = (body: any): Omit<Contact, 'id' | 'addedBy' | 'createdAt' | 'updatedAt'> | string => {
    const name = clip(body?.name, 60);
    if (name.length < 2) return 'Write the name';
    const phone = cleanPhone(body?.phone);
    if (phone.length < 3 || phone.length > 13) return 'Check the phone number';
    return { kind: body?.kind === 'other' || body?.kind === 'supplier' ? body.kind : 'helpline', name, role: clip(body?.role, 60), phone, note: clip(body?.note, 200) || undefined };
  };

  // Everything in one go, sorted for the screen.
  app.get(`${P}/contacts`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const [contacts, techs, vendors] = await Promise.all([
        deps.kv.getByPrefix<any>('contact:'), deps.kv.getByPrefix<any>('technician:'), deps.kv.getByPrefix<any>('supply-vendor:'),
      ]);
      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      const list = (contacts || []).filter((x: any) => x?.id && x.phone) as Contact[];
      return c.json({
        emergency: EMERGENCY,
        repairs: (techs || []).filter((t: any) => t?.id && t.phone)
          .map((t: any) => ({ id: String(t.id), name: String(t.name), role: String(t.trade || ''), phone: String(t.phone) }))
          .sort((a: any, b: any) => a.role.localeCompare(b.role) || byName(a, b)),
        helplines: list.filter((x) => x.kind === 'helpline').sort(byName),
        others: list.filter((x) => x.kind === 'other').sort(byName),
        // Shopping-list vendors (changed under Shopping > Vendors) and supplier numbers kept here.
        suppliers: [
          ...(vendors || []).filter((v: any) => v?.id && v.name)
            .map((v: any) => ({ id: String(v.id), name: String(v.name), vendorKind: v.kind || 'other', phone: v.phone ? String(v.phone) : '', vendor: true })),
          ...list.filter((x) => x.kind === 'supplier'),
        ].sort(byName),
        canEdit: canEdit(actor!),
        canManageVendors: actor!.isOwner || actor!.isOps,
        canRemoveRepairs: actor!.isOwner, // the technician list's rule (expensePaperwork.ts)
      });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/contacts`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!canEdit(actor!)) return c.json({ error: 'Only the owner, operations managers and incharges can add numbers' }, 403);
    try {
      const v = read(await c.req.json().catch(() => ({})));
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const all = ((await deps.kv.getByPrefix<any>('contact:')) || []).filter((x: any) => x?.id);
      if (all.length >= 200) return c.json({ error: 'That is the most numbers the directory keeps' }, 400);
      const same = all.find((x: any) => x.phone === v.phone && x.name.toLowerCase() === v.name.toLowerCase());
      if (same) return c.json({ contact: same, existing: true });
      const now = new Date().toISOString();
      const contact: Contact = { id: newId(), ...v, addedBy: actor!.name, createdAt: now, updatedAt: now };
      await deps.kv.set(contactKey(contact.id), contact);
      return c.json({ contact });
    } catch (err) { return fail(c, err); }
  });

  app.put(`${P}/contacts/:id`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!canEdit(actor!)) return c.json({ error: 'Only the owner, operations managers and incharges can change numbers' }, 403);
    try {
      const cur = await deps.kv.get<Contact>(contactKey(c.req.param('id')));
      if (!cur) return c.json({ error: 'That number was not found' }, 404);
      const v = read(await c.req.json().catch(() => ({})));
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const contact: Contact = { ...cur, ...v, updatedAt: new Date().toISOString() };
      await deps.kv.set(contactKey(contact.id), contact);
      return c.json({ contact });
    } catch (err) { return fail(c, err); }
  });

  app.delete(`${P}/contacts/:id`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!canEdit(actor!)) return c.json({ error: 'Only the owner, operations managers and incharges can remove numbers' }, 403);
    try {
      await deps.kv.del(contactKey(c.req.param('id')));
      return c.json({ ok: true });
    } catch (err) { return fail(c, err); }
  });
}

// Running low and shopping lists (owner, 28 Oct 2026).
//   Running low: anyone at a store or the production house flags a supply running low or finished
//   (washing powder, KOT rolls), with how much is needed if they know. The owner, the operations
//   managers and that place's incharge hear about it. Someone else flagging the same item adds to
//   the open flag instead of starting another. Whoever flagged it hears back when it is sorted.
//   Shopping lists: the owner or an operations manager writes what to buy, with the same item names
//   as the expenses, and sends it to whoever shops (the production incharge). It reaches them when
//   their quiet hours end. They tick what they got, add the bill photos and finish; the list then
//   waits for prices. Whoever wrote it fixes the quantities, sets the prices and saves - the app logs
//   each line through the usual expense routes (so production cash and the expense checks run as
//   for any expense) and reports each one back here. Flags on the list close when their line is
//   logged; a line not found puts its flags back to open.
//   Vendors (owner, 28 Oct 2026): lines can come from a vendor (vegetables, grocery, Kalimata, butter,
//   chicken). The writer sends each vendor its part on WhatsApp from the app (the phone opens WhatsApp
//   with the text; nothing is sent from the server), and the app keeps when. Saving a line with a
//   vendor teaches the app that item's vendor for next time.
//   Quantities (owner, 28 Oct 2026): packs say the size of each (2 packets x 1 L), vegetables go by
//   weight, leafy herbs by the bundle. The app checks each line as it is written; before sending,
//   Bunny (the same small AI model and monthly cap as the rest, insights.ts) checks the whole list
//   and suggests a corrected line for anything unclear.
// Registered from kpi.ts; lists waiting for the end of quiet hours go out with the store-cover cron.
//
//   supply-alert:{id}     one flag, and everyone who raised it
//   shopping-list:{id}    the list, what was got, what was logged
//   supply-vendor:{id}    a vendor: name, WhatsApp number, the items it supplies
//   supply-item-specs     how each item was last written on a list (unit, pack size)
import { P, actorOf, loadPlaces, type Actor, type KpiDeps } from './attendance.ts';
import { istDate } from './kpiCore.ts';
import { DEFAULT_PREFS } from './notificationRules.ts';
import { isBillPath } from './expensePaperwork.ts';
import { AiError, askClaudeForJson } from './insights.ts';
import {
  PACK_UNITS, alertRecipients, deliverAt, isInchargeOf, isOwnerEmp, itemKey, learnSpecs, learnVendorItems, linesPreview, listProgress, placeOf,
  type EntryKind, type ItemSpec, type Place, type ShoppingLine, type ShoppingList, type SupplyAlert, type Vendor, type VendorKind,
} from './suppliesRules.ts';

const alertKey = (id: string) => `supply-alert:${id}`;
const listKey = (id: string) => `shopping-list:${id}`;
const vendorKey = (id: string) => `supply-vendor:${id}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNITS = new Set(['g', 'kg', 'L', 'mL', 'pcs', 'packet', 'bottle', 'jar', 'bag', 'box', 'carton', 'tin', 'roll', 'bundle']);
const SIZE_UNITS = new Set(['g', 'kg', 'mL', 'L', 'pcs']);
const VENDOR_KINDS = new Set<VendorKind>(['vegetables', 'grocery', 'dairy', 'meat', 'other']);
const SPECS_KEY = 'supply-item-specs';
const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.round(x * 1000) / 1000 : null; };
const istDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
// The shopper's notification: what, for when, from whom.
const shopperNote = (list: ShoppingList, nowMs: number) => ({
  title: `Shopping list for ${list.date === istDate(nowMs) ? 'today' : istDay(list.date)}: ${list.lines.length} item${list.lines.length === 1 ? '' : 's'}`,
  message: `From ${list.createdByName}: ${linesPreview(list.lines)}.${list.note ? ` "${list.note}"` : ''} Home > Shopping list.`,
});

// What Bunny checks on a shopping list (owner's rules, 28 Oct 2026).
const QUANTITY_PROMPT = `You check a shopping list for Bunny Momos, a momo shop in Bardhaman, West Bengal, before it goes to vendors on WhatsApp. Every line must say exactly what to hand over, so the vendor cannot misread it.

The rules:
1. Anything sold in packs - oil, sauces, ketchup, mayonnaise, masalas and powders, gravies, ajinomoto, cheese, butter, sachets, seeds sold in packets - needs BOTH the number of packs (packet, bottle, jar, bag, box, carton or tin) AND the size of each pack (g, kg, mL, L, or pcs inside). "Oil 2 pcs" is wrong; "Oil 2 packets x 1 L" is right. A masala written only as a weight ("Chat masala 200 g") is wrong; "2 packets x 100 g" is right.
2. Vegetables go by weight (g or kg). Only leafy herbs - coriander leaves, pudina (mint), curry leaves, spring onion, methi, palak - go by the bundle, and they must be by the bundle. Lemons, limes and eggs may be counted in pcs.
3. Loose staples weighed out at the shop (maida, sugar, rice, besan, salt) may be a plain weight.
4. Chicken and meat go by weight in kg.
5. The amount must be believable for a small momo shop buying for a day or two: flag a likely typo (400 kg ginger, 0.5 g chilli, 60 packets of oil).

For each line that breaks a rule, return the problem in one short sentence for the manager (plain English, no jargon) and the corrected amount. Pick the pack size from how it was bought before when that is given, otherwise the usual Indian retail pack (1 L oil pouch, 1 kg mayonnaise, 100 g masala, 500 g butter); if you cannot tell, leave packSize null and say what to ask the vendor. Lines that follow the rules: leave them out. Never comment on prices.`;

type Ctx = { employees: any[]; places: Awaited<ReturnType<typeof loadPlaces>>; names: Map<string, string> };
async function loadCtx(deps: KpiDeps): Promise<Ctx> {
  const [employees, places, stores, houses] = await Promise.all([
    deps.kv.getByPrefix<any>('unified-employee:'), loadPlaces(deps.kv), deps.kv.getByPrefix<any>('store:'), deps.kv.getByPrefix<any>('production_house_'),
  ]);
  const names = new Map<string, string>();
  for (const s of stores || []) if (s?.id) names.set(`store:${s.id}`, String(s.name || 'Store'));
  for (const h of houses || []) if (h?.id) names.set(`production:${h.id}`, String(h.name || 'Production house'));
  return { employees: (employees || []).filter((e: any) => e?.employeeId && e.status !== 'inactive'), places, names };
}
const placeName = (ctx: Ctx, p: Place) => ctx.names.get(`${p.kind}:${p.id}`) || (p.kind === 'store' ? 'Store' : 'Production house');
const knownPlace = (ctx: Ctx, kind: unknown, id: unknown): Place | null => {
  const k = kind === 'production' ? 'production' : kind === 'store' ? 'store' : null;
  const i = String(id || '');
  if (!k || !i) return null;
  return (k === 'store' ? ctx.places.stores : ctx.places.houses).has(i) ? { kind: k, id: i } : null;
};
const isLead = (a: Actor) => a.isOwner || a.isOps;
const canClose = (a: Actor, al: SupplyAlert) => isLead(a) || isInchargeOf(a.emp, { kind: al.placeKind, id: al.placeId });

export function registerSuppliesRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => { console.log('[supplies]', err?.message || 'error'); return c.json({ error: 'Something went wrong - try again' }, 500); };
  const notify = (authUserId: string, type: string, title: string, message: string, relatedId?: string) =>
    deps.notifyUser ? deps.notifyUser(authUserId, type, title, message, relatedId).catch(() => undefined) : Promise.resolve(undefined);
  const allAlerts = async () => ((await deps.getAllByPrefix('supply-alert:')) || []).filter((a: any) => a?.id && a.placeId) as SupplyAlert[];
  const allLists = async () => ((await deps.getAllByPrefix('shopping-list:')) || []).filter((l: any) => l?.id && Array.isArray(l.lines)) as ShoppingList[];
  const allVendors = async () => ((await deps.kv.getByPrefix<any>('supply-vendor:')) || []).filter((v: any) => v?.id && v.name && Array.isArray(v.items)) as Vendor[];

  // Tell everyone who raised a flag what happened to it (not the person who did it).
  const tellRaisers = async (ctx: Ctx, al: SupplyAlert, title: string, message: string, exceptId: string | null) => {
    for (const r of al.raisedBy) {
      if (r.id === exceptId) continue;
      const e = ctx.employees.find((x) => String(x.employeeId) === r.id);
      if (e?.authUserId) await notify(e.authUserId, 'supply_sorted', title, message, al.id);
    }
  };

  // ---------------- Running low ----------------

  // Flags this person may see: the owner and ops all of them; an incharge their place's; everyone
  // what they raised and what is open at their place (so nobody flags it twice). Closed ones for 3 days.
  app.get(`${P}/supply-alerts`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const ctx = await loadCtx(deps);
      const me = actor!.employeeId;
      const lead = isLead(actor!);
      const myPlace = placeOf(actor!.emp, ctx.places);
      const recent = Date.now() - 3 * 86400000;
      const alerts = (await allAlerts())
        .filter((a) => a.status === 'open' || a.status === 'listed' || Date.parse(a.closedAt || a.updatedAt) >= recent)
        .filter((a) => {
          const place = { kind: a.placeKind, id: a.placeId };
          if (lead || isInchargeOf(actor!.emp, place) || a.raisedBy.some((r) => r.id === me)) return true;
          return (a.status === 'open' || a.status === 'listed') && !!myPlace && myPlace.kind === a.placeKind && myPlace.id === a.placeId;
        })
        .sort((a, b) => Number(b.status === 'open' || b.status === 'listed') - Number(a.status === 'open' || a.status === 'listed') || b.updatedAt.localeCompare(a.updatedAt))
        .map((a) => ({ ...a, canClose: canClose(actor!, a), mine: a.raisedBy.some((r) => r.id === me) }));
      const places = lead ? [...ctx.places.stores].map((id) => ({ kind: 'store', id, name: placeName(ctx, { kind: 'store', id }) }))
        .concat([...ctx.places.houses].map((id) => ({ kind: 'production', id, name: placeName(ctx, { kind: 'production', id }) }))) : undefined;
      return c.json({ alerts, canManage: lead, myPlace: myPlace ? { ...myPlace, name: placeName(ctx, myPlace) } : null, places });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/supply-alerts`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const ctx = await loadCtx(deps);
      const place = (isLead(actor!) ? knownPlace(ctx, body?.placeKind, body?.placeId) : null) || placeOf(actor!.emp, ctx.places);
      if (!place) return c.json({ error: 'Pick the store or production house' }, 400);
      const item = clip(body?.item, 60);
      if (!item) return c.json({ error: 'Which item is running low?' }, 400);
      const level = body?.level === 'out' ? 'out' : 'low';
      const qty = num(body?.qty);
      const unit = qty && UNITS.has(String(body?.unit)) ? String(body.unit) : null;
      const note = clip(body?.note, 200);
      const now = new Date().toISOString();
      const me = { id: actor!.employeeId || actor!.userId, name: actor!.name, at: now };

      // Already flagged here and not sorted yet: add to that one.
      const same = (await allAlerts()).find((a) => (a.status === 'open' || a.status === 'listed') && a.placeKind === place.kind && a.placeId === place.id && itemKey(a.item) === itemKey(item));
      if (same) {
        const worse = level === 'out' && same.level !== 'out';
        const next: SupplyAlert = {
          ...same, level: worse ? 'out' : same.level, qty: qty ?? same.qty ?? null, unit: qty ? unit : same.unit ?? null,
          note: note && note !== same.note ? clip([same.note, note].filter(Boolean).join(' · '), 300) : same.note,
          raisedBy: same.raisedBy.some((r) => r.id === me.id) ? same.raisedBy : [...same.raisedBy, me], updatedAt: now,
        };
        await deps.kv.set(alertKey(same.id), next);
        // Only news is worth a buzz: it has now run out.
        if (worse) {
          for (const e of alertRecipients(ctx.employees, place, me.id)) {
            await notify(e.authUserId, 'supply_low', `Finished: ${item}`, `${placeName(ctx, place)}: ${me.name} says ${item} has run out.${note ? ` "${note}"` : ''}`, same.id);
          }
        }
        return c.json({ alert: next, merged: true });
      }

      const alert: SupplyAlert = {
        id: newId(), placeKind: place.kind, placeId: place.id, placeName: placeName(ctx, place),
        item, itemBn: clip(body?.itemBn, 60) || undefined,
        entryType: body?.entryType === 'overhead' ? 'overhead' : body?.entryType === 'inventory' ? 'inventory' : undefined,
        category: clip(body?.category, 40) || undefined,
        level, qty, unit, note: note || undefined, raisedBy: [me], status: 'open', listId: null, createdAt: now, updatedAt: now,
      };
      await deps.kv.set(alertKey(alert.id), alert);
      const need = qty ? ` - needs ${qty} ${unit || ''}`.trimEnd() : '';
      for (const e of alertRecipients(ctx.employees, place, me.id)) {
        await notify(e.authUserId, 'supply_low', `${level === 'out' ? 'Finished' : 'Running low'}: ${item}`,
          `${alert.placeName}: ${me.name} says ${item} ${level === 'out' ? 'has run out' : 'is running low'}${need}.${note ? ` "${note}"` : ''}`, alert.id);
      }
      return c.json({ alert, merged: false });
    } catch (err) { return fail(c, err); }
  });

  // Sorted (bought, refilled, found) or not needed - by the owner, ops or the place's incharge.
  app.post(`${P}/supply-alerts/:id/close`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const al = await deps.kv.get<SupplyAlert>(alertKey(c.req.param('id')));
      if (!al) return c.json({ error: 'That flag was not found' }, 404);
      if (!canClose(actor!, al)) return c.json({ error: 'Only the owner, operations or the incharge can do this' }, 403);
      const body = await c.req.json().catch(() => ({}));
      const outcome = body?.outcome === 'dropped' ? 'dropped' : 'done';
      const note = clip(body?.note, 200);
      const next: SupplyAlert = { ...al, status: outcome, closedByName: actor!.name, closedAt: new Date().toISOString(), closedNote: note || undefined, updatedAt: new Date().toISOString() };
      await deps.kv.set(alertKey(al.id), next);
      const ctx = await loadCtx(deps);
      await tellRaisers(ctx, next, `${al.item}: ${outcome === 'done' ? 'sorted' : 'not needed'}`, `${actor!.name}${note ? `: ${note}` : ` marked it ${outcome === 'done' ? 'sorted' : 'not needed'}.`}`, actor!.employeeId);
      return c.json({ alert: next });
    } catch (err) { return fail(c, err); }
  });

  // ---------------- Vendors ----------------

  const phoneOf = (v: unknown) => String(v ?? '').replace(/\D/g, '');
  const cleanVendor = (body: any, others: Vendor[]): { name: string; kind: VendorKind; phone?: string; items: string[] } | string => {
    const name = clip(body?.name, 40);
    if (!name) return 'Write the vendor\'s name';
    if (others.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) return `There is already a vendor called ${name}`;
    const phone = phoneOf(body?.phone);
    if (phone && (phone.length < 10 || phone.length > 13)) return 'Check the WhatsApp number: 10 digits';
    const seen = new Set<string>();
    const items = (Array.isArray(body?.items) ? body.items : []).map((i: unknown) => clip(i, 60)).filter((i: string) => {
      const k = itemKey(i);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 200);
    return { name, kind: VENDOR_KINDS.has(body?.kind) ? body.kind : 'other', phone: phone || undefined, items };
  };
  // An item belongs to one vendor: one saved here comes off the others.
  const takeItems = async (keep: Vendor, all: Vendor[]) => {
    const mine = new Set(keep.items.map(itemKey));
    for (const v of all) {
      if (v.id === keep.id || !v.items.some((i) => mine.has(itemKey(i)))) continue;
      await deps.kv.set(vendorKey(v.id), { ...v, items: v.items.filter((i) => !mine.has(itemKey(i))), updatedAt: keep.updatedAt });
    }
  };

  // The owner and ops: the vendors, and how each item was last written on a list.
  app.get(`${P}/supply-vendors`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can see the vendors' }, 403);
    try {
      const [vendors, specs] = await Promise.all([allVendors(), deps.kv.get<Record<string, ItemSpec>>(SPECS_KEY)]);
      return c.json({ vendors: vendors.sort((a, b) => a.name.localeCompare(b.name)), specs: specs || {} });
    } catch (err) { return fail(c, err); }
  });

  // Bunny checks a list's quantities before it is sent: each line must say exactly what to hand
  // over. Only item names, amounts, vendor types and past amounts go to the AI.
  app.post(`${P}/shopping-lists/check`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can check a list' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const lines = (Array.isArray(body?.lines) ? body.lines : []).slice(0, 80).map((l: any) => ({
        key: clip(l?.key, 20), item: clip(l?.item, 60), amount: clip(l?.amount, 40) || 'not given',
        vendor: VENDOR_KINDS.has(l?.vendorKind) ? l.vendorKind : 'a shop', before: clip(l?.before, 80) || undefined,
      })).filter((l: any) => l.key && l.item);
      if (!lines.length) return c.json({ issues: [] });
      const n = { anyOf: [{ type: 'number' }, { type: 'null' }] };
      const { data } = await askClaudeForJson(deps.kv, {
        purpose: 'shopping-check', user: { id: actor!.userId, isOwner: actor!.isOwner }, effort: 'low', maxTokens: 2500,
        system: QUANTITY_PROMPT,
        prompt: `The list (JSON, one object per line; "before" is how it was bought last time, from the expenses):\n${JSON.stringify(lines)}`,
        schema: {
          type: 'object', additionalProperties: false, required: ['issues'],
          properties: {
            issues: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false, required: ['key', 'problem', 'qty', 'unit', 'packSize', 'packUnit'],
                properties: {
                  key: { type: 'string', description: 'The line\'s key, exactly as given' },
                  problem: { type: 'string', description: 'One short plain-English sentence: what is unclear and what to write instead' },
                  qty: { ...n, description: 'Corrected number of packs, or the weight/count; null if it cannot be known' },
                  unit: { anyOf: [{ type: 'string', enum: [...UNITS] }, { type: 'null' }] },
                  packSize: { ...n, description: 'Size of each pack when unit is a pack (packet, bottle, jar, bag, box, carton, tin); null if unknown or not a pack' },
                  packUnit: { anyOf: [{ type: 'string', enum: [...SIZE_UNITS] }, { type: 'null' }] },
                },
              },
            },
          },
        },
      });
      const keys = new Set(lines.map((l: any) => l.key));
      const issues = (Array.isArray(data?.issues) ? data.issues : []).filter((i: any) => keys.has(i?.key) && i.problem).map((i: any) => ({
        key: String(i.key), problem: clip(i.problem, 200),
        fix: num(i.qty) && UNITS.has(String(i.unit)) ? {
          qty: num(i.qty), unit: String(i.unit),
          ...(PACK_UNITS.has(String(i.unit)) && num(i.packSize) && SIZE_UNITS.has(String(i.packUnit)) ? { packSize: num(i.packSize), packUnit: String(i.packUnit) } : {}),
        } : null,
      }));
      return c.json({ issues });
    } catch (err: any) {
      if (err instanceof AiError) return c.json({ error: err.message }, err.status);
      return fail(c, err);
    }
  });

  app.post(`${P}/supply-vendors`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can add a vendor' }, 403);
    try {
      const all = await allVendors();
      if (all.length >= 40) return c.json({ error: 'That is the most vendors the app keeps' }, 400);
      const v = cleanVendor(await c.req.json().catch(() => ({})), all);
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const now = new Date().toISOString();
      const vendor: Vendor = { id: newId(), ...v, createdAt: now, updatedAt: now };
      await deps.kv.set(vendorKey(vendor.id), vendor);
      await takeItems(vendor, all);
      return c.json({ vendor });
    } catch (err) { return fail(c, err); }
  });

  app.put(`${P}/supply-vendors/:id`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can change a vendor' }, 403);
    try {
      const all = await allVendors();
      const cur = all.find((v) => v.id === c.req.param('id'));
      if (!cur) return c.json({ error: 'That vendor was not found' }, 404);
      const v = cleanVendor(await c.req.json().catch(() => ({})), all.filter((o) => o.id !== cur.id));
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const vendor: Vendor = { ...cur, ...v, phone: v.phone, updatedAt: new Date().toISOString() };
      await deps.kv.set(vendorKey(vendor.id), vendor);
      await takeItems(vendor, all);
      return c.json({ vendor });
    } catch (err) { return fail(c, err); }
  });

  // Lists keep the vendor's name on their lines, so old lists still read right.
  app.delete(`${P}/supply-vendors/:id`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can remove a vendor' }, 403);
    try {
      const cur = await deps.kv.get<Vendor>(vendorKey(c.req.param('id')));
      if (!cur) return c.json({ error: 'That vendor was not found' }, 404);
      await deps.kv.del(vendorKey(cur.id));
      return c.json({ ok: true });
    } catch (err) { return fail(c, err); }
  });

  // ---------------- Shopping lists ----------------

  const canShop = (a: Actor, l: ShoppingList) => isLead(a) || (!!a.employeeId && a.employeeId === l.assigneeId);
  const cleanLines = (ctx: Ctx, vendors: Vendor[], raw: unknown, before: ShoppingLine[] = []): ShoppingLine[] | string => {
    if (!Array.isArray(raw) || !raw.length) return 'Add at least one item';
    if (raw.length > 80) return 'That is too many lines for one list';
    const out: ShoppingLine[] = [];
    for (const r of raw as any[]) {
      const item = clip(r?.item, 60);
      if (!item) return 'Every line needs an item';
      const place = knownPlace(ctx, r?.placeKind, r?.placeId);
      if (!place) return `Pick where ${item} is for`;
      const old = before.find((b) => b.id === r?.id);
      const vendor = r?.vendorId ? vendors.find((v) => v.id === String(r.vendorId)) : null;
      const unit = UNITS.has(String(r?.unit)) ? String(r.unit) : 'pcs';
      const packSize = PACK_UNITS.has(unit) ? num(r?.packSize) : null;
      const packUnit = packSize && SIZE_UNITS.has(String(r?.packUnit)) ? String(r.packUnit) : null;
      out.push({
        id: old?.id || newId(), item, itemBn: clip(r?.itemBn, 60) || undefined,
        entryType: (r?.entryType === 'overhead' ? 'overhead' : 'inventory') as EntryKind, category: clip(r?.category, 40) || 'staples',
        qty: num(r?.qty) || 0, unit, packSize: packUnit ? packSize : null, packUnit, placeKind: place.kind, placeId: place.id, placeName: placeName(ctx, place),
        note: clip(r?.note, 120) || undefined, alertIds: Array.isArray(r?.alertIds) ? r.alertIds.map(String).slice(0, 10) : undefined,
        vendorId: vendor?.id || null, vendorName: vendor?.name || undefined,
        got: old?.got ?? null, missing: old?.missing, logged: old?.logged ?? null, skipped: old?.skipped,
      });
    }
    return out;
  };
  // Flags on a list show as "on the list"; flags taken off it are open again.
  const syncAlerts = async (list: ShoppingList, before: ShoppingLine[] = []) => {
    const now = new Set(list.status === 'cancelled' ? [] : list.lines.flatMap((l) => (l.missing ? [] : l.alertIds || [])));
    const all = new Set([...before.flatMap((l) => l.alertIds || []), ...list.lines.flatMap((l) => l.alertIds || [])]);
    for (const id of all) {
      const al = await deps.kv.get<SupplyAlert>(alertKey(id));
      if (!al || al.status === 'done' || al.status === 'dropped') continue;
      const listed = now.has(id);
      if (listed && (al.status !== 'listed' || al.listId !== list.id)) await deps.kv.set(alertKey(id), { ...al, status: 'listed', listId: list.id, updatedAt: new Date().toISOString() });
      if (!listed && al.status === 'listed' && al.listId === list.id) await deps.kv.set(alertKey(id), { ...al, status: 'open', listId: null, updatedAt: new Date().toISOString() });
    }
  };
  // Items saved with a vendor are that vendor's from now on.
  // and each item starts from how it was last written.
  const learnVendors = async (vendors: Vendor[], lines: ShoppingLine[]) => {
    const now = new Date().toISOString();
    for (const v of learnVendorItems(vendors, lines)) await deps.kv.set(vendorKey(v.id), { ...v, items: v.items.slice(0, 200), updatedAt: now });
    await deps.kv.set(SPECS_KEY, learnSpecs((await deps.kv.get<Record<string, ItemSpec>>(SPECS_KEY)) || {}, lines, now));
  };
  const tellShopper = async (ctx: Ctx, list: ShoppingList) => {
    const person = ctx.employees.find((e) => String(e.employeeId) === list.assigneeId);
    if (!person?.authUserId) return;
    const n = shopperNote(list, Date.now());
    await notify(person.authUserId, 'shopping_list', n.title, n.message, list.id);
  };
  // Send now, or hold it for the end of the shopper's quiet hours (the store-cover cron sends it).
  const send = async (ctx: Ctx, list: ShoppingList): Promise<ShoppingList> => {
    const person = ctx.employees.find((e) => String(e.employeeId) === list.assigneeId);
    const prefs = person?.authUserId ? { ...DEFAULT_PREFS, ...((await deps.kv.get<any>(`notification-prefs:${person.authUserId}`)) || {}) } : null;
    const now = Date.now();
    const at = deliverAt(prefs, now);
    const next: ShoppingList = { ...list, status: 'sent', sentAt: new Date(now).toISOString(), notifyAt: new Date(at).toISOString(), notifiedAt: undefined };
    if (at <= now + 60000) { await tellShopper(ctx, next); next.notifiedAt = new Date().toISOString(); }
    return next;
  };
  const view = (a: Actor, l: ShoppingList) => ({ ...l, progress: listProgress(l), canEdit: isLead(a), canShop: canShop(a, l) });

  // The owner and ops: lists from the last week (?days= up to 90, for Shopping lists under More)
  // and any still open. The shopper: theirs once sent.
  app.get(`${P}/shopping-lists`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const lead = isLead(actor!);
      const today = istDate(Date.now());
      const days = Math.min(90, Math.max(7, Number(c.req.query('days')) || 7));
      const weekAgo = istDate(Date.now() - days * 86400000);
      const open = (l: ShoppingList) => l.status === 'draft' || l.status === 'sent' || l.status === 'shopping' || l.status === 'bought';
      const lists = (await allLists())
        .filter((l) => l.status !== 'cancelled')
        .filter((l) => (lead ? open(l) || l.date >= weekAgo : l.assigneeId === actor!.employeeId && l.status !== 'draft' && (open(l) || l.date >= istDate(Date.now() - 2 * 86400000))))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .map((l) => view(actor!, l));
      if (!lead) return c.json({ lists, canManage: false, today });
      const ctx = await loadCtx(deps);
      const people = ctx.employees.filter((e) => isOwnerEmp(e) || e.role === 'manager')
        .map((e) => ({ id: String(e.employeeId), name: String(e.name || e.employeeId), designation: e.designation || null }))
        .sort((a, b) => Number(b.designation === 'production_incharge') - Number(a.designation === 'production_incharge') || a.name.localeCompare(b.name));
      const places = [...ctx.places.houses].map((id) => ({ kind: 'production', id, name: placeName(ctx, { kind: 'production', id }) }))
        .concat([...ctx.places.stores].map((id) => ({ kind: 'store', id, name: placeName(ctx, { kind: 'store', id }) })));
      return c.json({ lists, canManage: true, today, people, places });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/shopping-lists`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can write a shopping list' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const ctx = await loadCtx(deps);
      const date = DATE.test(String(body?.date)) ? String(body.date) : istDate(Date.now() + 86400000);
      const person = ctx.employees.find((e) => String(e.employeeId) === String(body?.assigneeId));
      if (!person) return c.json({ error: 'Pick who does the shopping' }, 400);
      const vendors = await allVendors();
      const lines = cleanLines(ctx, vendors, body?.lines);
      if (typeof lines === 'string') return c.json({ error: lines }, 400);
      const now = new Date().toISOString();
      let list: ShoppingList = {
        id: newId(), date, assigneeId: String(person.employeeId), assigneeName: String(person.name || person.employeeId),
        createdById: actor!.employeeId || actor!.userId, createdByName: actor!.name, createdByUserId: actor!.userId, createdAt: now, updatedAt: now,
        status: 'draft', note: clip(body?.note, 200) || undefined, lines, bills: [],
      };
      if (body?.send) list = await send(ctx, list);
      await deps.kv.set(listKey(list.id), list);
      await syncAlerts(list);
      await learnVendors(vendors, list.lines);
      return c.json({ list: view(actor!, list) });
    } catch (err) { return fail(c, err); }
  });

  // Change a list before the shopping starts; send it if asked.
  app.put(`${P}/shopping-lists/:id`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can change a shopping list' }, 403);
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (list.status !== 'draft' && list.status !== 'sent') return c.json({ error: 'The shopping has started - this list can no longer be changed' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const ctx = await loadCtx(deps);
      const person = body?.assigneeId ? ctx.employees.find((e) => String(e.employeeId) === String(body.assigneeId)) : null;
      if (body?.assigneeId && !person) return c.json({ error: 'Pick who does the shopping' }, 400);
      const vendors = await allVendors();
      const lines = body?.lines ? cleanLines(ctx, vendors, body.lines, list.lines) : list.lines;
      if (typeof lines === 'string') return c.json({ error: lines }, 400);
      let next: ShoppingList = {
        ...list, lines, date: DATE.test(String(body?.date)) ? String(body.date) : list.date, note: body?.note !== undefined ? clip(body.note, 200) || undefined : list.note,
        ...(person ? { assigneeId: String(person.employeeId), assigneeName: String(person.name || person.employeeId) } : {}),
        updatedAt: new Date().toISOString(),
      };
      // Sent to someone else, or sent now: it goes out (again).
      if (body?.send && (next.status === 'draft' || (person && person.employeeId !== list.assigneeId))) next = await send(ctx, next);
      await deps.kv.set(listKey(list.id), next);
      await syncAlerts(next, list.lines);
      if (body?.lines) await learnVendors(vendors, next.lines);
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  // When the shopper first opened the list (the shopping-list notification they read), for the
  // owner's timeline under More > Shopping lists.
  app.get(`${P}/shopping-lists/:id/seen`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can see this' }, 403);
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      const person = await deps.kv.get<any>(`unified-employee:${list.assigneeId}`);
      if (!person?.authUserId) return c.json({ seenAt: null, reachedAt: null });
      const mine = ((await deps.getAllByPrefix(`notification:${person.authUserId}:`)) || [])
        .filter((n: any) => n?.relatedId === list.id && n.type === 'shopping_list');
      const first = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0] || null;
      return c.json({ reachedAt: first(mine.map((n: any) => n.createdAt)), seenAt: first(mine.map((n: any) => n.readAt)) });
    } catch (err) { return fail(c, err); }
  });

  // The writer sent a vendor its part on WhatsApp (from their phone): when, and what it said.
  app.post(`${P}/shopping-lists/:id/vendor-sent`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can order from vendors' }, 403);
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list || list.status === 'cancelled') return c.json({ error: 'That list was not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const vendorId = clip(body?.vendorId, 40);
      if (!vendorId || !list.lines.some((l) => l.vendorId === vendorId)) return c.json({ error: 'Nothing on this list is from that vendor' }, 400);
      const next: ShoppingList = {
        ...list, vendorOrders: { ...(list.vendorOrders || {}), [vendorId]: { at: new Date().toISOString(), byName: actor!.name, sig: clip(body?.sig, 4000) } },
        updatedAt: new Date().toISOString(),
      };
      await deps.kv.set(listKey(list.id), next);
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/shopping-lists/:id/cancel`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can cancel a list' }, 403);
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (list.lines.some((l) => l.logged)) return c.json({ error: 'Some of it is already in the expenses - it cannot be cancelled now' }, 409);
      const next: ShoppingList = { ...list, status: 'cancelled', updatedAt: new Date().toISOString() };
      await deps.kv.set(listKey(list.id), next);
      await syncAlerts(next, list.lines);
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  // The shopper: got it (how much), or not found. qty null and missing false clears the line.
  app.post(`${P}/shopping-lists/:id/got`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (!canShop(actor!, list)) return c.json({ error: 'This list is someone else\'s' }, 403);
      if (list.status !== 'sent' && list.status !== 'shopping') return c.json({ error: 'This list is already finished' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const line = list.lines.find((l) => l.id === String(body?.lineId));
      if (!line) return c.json({ error: 'That line is not on the list' }, 404);
      const qty = num(body?.qty);
      line.missing = body?.missing === true && !qty;
      line.missingAt = line.missing ? new Date().toISOString() : undefined;
      line.got = qty ? { qty, at: new Date().toISOString() } : null;
      const next: ShoppingList = { ...list, status: 'shopping', updatedAt: new Date().toISOString() };
      await deps.kv.set(listKey(list.id), next);
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  // A bill photo (uploaded first through /expense-bills), for whoever sets the prices.
  app.post(`${P}/shopping-lists/:id/bill`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (!canShop(actor!, list)) return c.json({ error: 'This list is someone else\'s' }, 403);
      const body = await c.req.json().catch(() => ({}));
      if (!isBillPath(body?.path)) return c.json({ error: 'Take the bill photo again' }, 400);
      if ((list.bills || []).length >= 6) return c.json({ error: 'Six bill photos is the most for one list' }, 400);
      const next: ShoppingList = { ...list, bills: [...(list.bills || []), { path: String(body.path), at: new Date().toISOString() }], updatedAt: new Date().toISOString() };
      await deps.kv.set(listKey(list.id), next);
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  // The shopping is done: every line got or not found. Whoever wrote the list sets the prices.
  app.post(`${P}/shopping-lists/:id/done`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (!canShop(actor!, list)) return c.json({ error: 'This list is someone else\'s' }, 403);
      if (list.status !== 'sent' && list.status !== 'shopping') return c.json({ error: 'This list is already finished' }, 409);
      const p = listProgress(list);
      if (p.left) return c.json({ error: `Mark the last ${p.left} item${p.left === 1 ? '' : 's'}: got it, or not found` }, 400);
      const next: ShoppingList = { ...list, status: p.got ? 'bought' : 'logged', boughtAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(p.got ? {} : { loggedAt: new Date().toISOString() }) };
      await deps.kv.set(listKey(list.id), next);
      await syncAlerts(next, list.lines);
      const ctx = await loadCtx(deps);
      const writer = ctx.employees.find((e) => String(e.employeeId) === list.createdById);
      const to = writer?.authUserId || list.createdByUserId;
      if (to && to !== actor!.userId) {
        await notify(to, 'shopping_done', `Shopping done: ${p.got} of ${p.total} got`,
          `${actor!.name} finished the ${istDay(list.date)} list${p.missing ? ` (${p.missing} not found)` : ''}${(next.bills || []).length ? ` with ${(next.bills || []).length} bill photo${(next.bills || []).length === 1 ? '' : 's'}` : ''}. ${p.got ? 'Fix the quantities and set the prices: Home > Shopping.' : ''}`.trim(), list.id);
      }
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });

  // The app logged a line as an expense (or the price-setter left it out): recorded here. When every
  // line got is logged, the list is done and its flags close as bought.
  app.post(`${P}/shopping-lists/:id/logged`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can set the prices' }, 403);
    try {
      const list = await deps.kv.get<ShoppingList>(listKey(c.req.param('id')));
      if (!list) return c.json({ error: 'That list was not found' }, 404);
      if (list.status !== 'bought') return c.json({ error: 'This list is not waiting for prices' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const line = list.lines.find((l) => l.id === String(body?.lineId));
      if (!line) return c.json({ error: 'That line is not on the list' }, 404);
      if (body?.skip) line.skipped = true;
      else {
        const id = clip(body?.recordId, 80);
        if (!id) return c.json({ error: 'Which expense was it saved as?' }, 400);
        line.logged = { kind: body?.kind === 'overhead' ? 'overhead' : 'inventory', id, at: new Date().toISOString() };
        const qty = num(body?.qty);
        if (qty && line.got) line.got = { ...line.got, qty };
      }
      const done = listProgress(list).toLog === 0;
      const next: ShoppingList = { ...list, ...(done ? { status: 'logged', loggedAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() };
      await deps.kv.set(listKey(list.id), next);
      // This line's flags are sorted: it was bought.
      if (line.logged && line.alertIds?.length) {
        const ctx = await loadCtx(deps);
        for (const id of line.alertIds) {
          const al = await deps.kv.get<SupplyAlert>(alertKey(id));
          if (!al || al.status === 'done' || al.status === 'dropped') continue;
          const closed: SupplyAlert = { ...al, status: 'done', closedByName: list.assigneeName, closedAt: new Date().toISOString(), closedNote: `Bought ${line.got?.qty ?? ''} ${line.unit}`.replace(/\s+/g, ' ').trim(), updatedAt: new Date().toISOString() };
          await deps.kv.set(alertKey(id), closed);
          await tellRaisers(ctx, closed, `${al.item}: bought`, `${list.assigneeName} bought ${line.got?.qty ?? ''} ${line.unit} for ${al.placeName}.`.replace(/\s+/g, ' '), null);
        }
      }
      return c.json({ list: view(actor!, next) });
    } catch (err) { return fail(c, err); }
  });
}

// Lists held for the end of the shopper's quiet hours go out now. Called from the store-cover cron
// (every half hour), so no job of its own.
export async function shoppingListTick(deps: KpiDeps) {
  if (!deps.notifyUser) return 0;
  const now = Date.now();
  const due = ((await deps.getAllByPrefix('shopping-list:')) || [])
    .filter((l: any) => l?.status === 'sent' && !l.notifiedAt && l.notifyAt && Date.parse(l.notifyAt) <= now) as ShoppingList[];
  if (!due.length) return 0;
  const employees = ((await deps.kv.getByPrefix<any>('unified-employee:')) || []).filter((e: any) => e?.employeeId);
  let sent = 0;
  for (const list of due) {
    const person = employees.find((e: any) => String(e.employeeId) === list.assigneeId);
    if (person?.authUserId) {
      const n = shopperNote(list, now);
      await deps.notifyUser(person.authUserId, 'shopping_list', n.title, n.message, list.id).catch(() => undefined);
      sent++;
    }
    await deps.kv.set(listKey(list.id), { ...list, notifiedAt: new Date().toISOString() });
  }
  return sent;
}

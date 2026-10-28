// Machine breakdowns (owner, 28 Oct 2026: "if machine failure raise an alarm for repair which will
// go to incharge and owner in home screen"). An alarm is raised when the day's leftover stuffing
// is put down to a machine failure (production-ledger close), and stays on the incharge's and the
// owner's Home until someone marks the machine repaired. It records which machine, when it went
// down and came back, and what was used instead. A machine from the equipment register is set to
// "Needs repair" while the alarm is open and back to "Good" when it is fixed.
//
//   repair-alert:{id}   one breakdown (open / fixed)

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
};
export type RepairDeps = {
  kv: Kv;
  rows: (prefix: string) => Promise<any[]>;
  verifyUser: (authHeader: string | null) => Promise<any>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
};
export type RepairAlert = {
  id: string; status: 'open' | 'fixed';
  locationKind: 'production' | 'store'; locationId: string; locationName?: string;
  assetId?: string | null; machine: string;
  date: string; downFrom?: string | null; downTo?: string | null; stillDown: boolean;
  alternative?: string; note?: string; source: 'leftover' | 'manual';
  reportedBy: string; reportedById?: string | null; reportedAt: string;
  assetWasCondition?: string | null; // the register condition before the alarm set it to "Needs repair"
  fixedBy?: string; fixedAt?: string; fixNote?: string; repairCost?: number | null;
};

const P = '/make-server-c2dd9b9d';
const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const fmt12 = (hhmm?: string | null) => {
  if (!hhmm || !TIME.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export const downText = (a: Pick<RepairAlert, 'downFrom' | 'downTo' | 'stillDown'>) =>
  a.downFrom ? (a.stillDown || !a.downTo ? `down since ${fmt12(a.downFrom)}` : `down ${fmt12(a.downFrom)}–${fmt12(a.downTo)}`) : (a.stillDown ? 'still down' : '');

// Who hears about a breakdown: the place's incharge, the operations managers and the owner.
async function peopleToTell(deps: RepairDeps, kind: string, placeId: string) {
  const people = await deps.rows('unified-employee:');
  const designation = kind === 'store' ? 'store_incharge' : 'production_incharge';
  return people.filter((p: any) => p?.status !== 'inactive' && p?.authUserId && (
    p.role === 'cluster_head'
    || (p.role === 'manager' && p.designation !== 'store_incharge' && p.designation !== 'production_incharge')
    || (p.designation === designation && (p.storeId === placeId || (p.assignedStoreIds || []).includes(placeId) || (p.assignedProductionHouseIds || []).includes(placeId)))
  ));
}

export async function raiseRepairAlert(deps: RepairDeps, input: Omit<RepairAlert, 'id' | 'status' | 'reportedAt' | 'assetWasCondition'>): Promise<RepairAlert> {
  const reportedAt = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let assetWasCondition: string | null = null;
  if (input.assetId) {
    const asset = await deps.kv.get(`asset:${input.assetId}`).catch(() => null);
    if (asset && !asset.dismissed && asset.condition !== 'disposed') {
      assetWasCondition = asset.condition || 'good';
      if (asset.condition === 'good') await deps.kv.set(`asset:${input.assetId}`, { ...asset, condition: 'needs_repair', updatedAt: reportedAt, updatedBy: input.reportedBy });
    }
  }
  const alert: RepairAlert = { ...input, id, status: 'open', reportedAt, assetWasCondition };
  await deps.kv.set(`repair-alert:${id}`, alert);
  const where = alert.locationName || (alert.locationKind === 'store' ? 'the store' : 'production');
  const message = `${alert.machine} at ${where}${downText(alert) ? `, ${downText(alert)}` : ''}${alert.alternative ? `. Instead: ${alert.alternative}` : ''}. Get it repaired.`;
  for (const p of await peopleToTell(deps, alert.locationKind, alert.locationId)) {
    await deps.notifyUser(p.authUserId, 'repair_alert', `Machine down: ${alert.machine}`, message, id, alert.date).catch(() => undefined);
  }
  return alert;
}

export function registerRepairRoutes(app: any, deps: RepairDeps) {
  // The owner and operations managers see every place; an incharge their own.
  const viewerOf = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const all = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    const places = new Set<string>();
    if (m.designation === 'store_incharge' || m.designation === 'production_incharge') {
      [m.storeId, ...(m.assignedStoreIds || []), ...(m.assignedProductionHouseIds || [])].filter(Boolean).forEach((id: string) => places.add(String(id)));
    }
    if (!all && places.size === 0) return { error: c.json({ error: 'Only the owner, operations managers and incharges see machine repairs' }, 403) };
    return { all, places, name: m.name || auth.user.email || 'Someone' };
  };
  const canSee = (v: { all: boolean; places: Set<string> }, a: RepairAlert) => v.all || v.places.has(a.locationId);

  app.get(`${P}/repair-alerts`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const status = c.req.query('status') || 'open';
      const alerts = (await deps.rows('repair-alert:'))
        .filter((a: RepairAlert) => a && (status === 'all' || a.status === status) && canSee(v, a))
        .sort((a: RepairAlert, b: RepairAlert) => String(b.reportedAt).localeCompare(String(a.reportedAt)));
      return c.json({ alerts });
    } catch (error) {
      console.log('Error listing repair alerts:', error);
      return c.json({ error: 'Could not load the machine repairs' }, 500);
    }
  });

  app.post(`${P}/repair-alerts/:id/fixed`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const id = decodeURIComponent(c.req.param('id'));
      const alert: RepairAlert | null = await deps.kv.get(`repair-alert:${id}`);
      if (!alert) return c.json({ error: 'That breakdown was not found' }, 404);
      if (!canSee(v, alert)) return c.json({ error: 'This machine belongs to another place' }, 403);
      if (alert.status !== 'open') return c.json({ error: 'Already marked repaired' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const cost = Number(body?.repairCost);
      const fixedAt = new Date().toISOString();
      const next: RepairAlert = {
        ...alert, status: 'fixed', fixedBy: v.name, fixedAt, fixNote: str(body?.note, 300) || undefined,
        repairCost: Number.isFinite(cost) && cost >= 0 && cost <= 500000 ? Math.round(cost) : null,
      };
      await deps.kv.set(`repair-alert:${id}`, next);
      // The register machine goes back to how it was, if the alarm was what marked it.
      if (alert.assetId && alert.assetWasCondition === 'good') {
        const asset = await deps.kv.get(`asset:${alert.assetId}`).catch(() => null);
        if (asset && asset.condition === 'needs_repair') await deps.kv.set(`asset:${alert.assetId}`, { ...asset, condition: 'good', updatedAt: fixedAt, updatedBy: v.name });
      }
      return c.json({ alert: next });
    } catch (error) {
      console.log('Error marking a repair done:', error);
      return c.json({ error: 'Could not save that' }, 500);
    }
  });
}

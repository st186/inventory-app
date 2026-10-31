// More > Cameras (owner, 29 Oct 2026): what each camera saw that needs a look - someone without
// cap, gloves or apron in working hours, someone in view after them - with the photo, to mark
// correct, false alarm or one of us (server cctv.ts). The owner sets each camera's hours, how often
// it checks and what it checks; the camera PC (tools/cctv) needs the camera's key. Kitchen
// activity (KitchenActivity.tsx): "Who is who" for the owner, operations and the incharge; the
// numbers for the owner only.
import { useCallback, useEffect, useState } from 'react';
import { Camera as CameraIcon, CheckCircle2, Copy, KeyRound, Pencil, Plus, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useT } from '../../utils/i18n';
import { useShell } from '../shell/ShellContext';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NativeSelect } from '../ui/select';
import { SegmentedControl } from '../ui/segmented-control';
import { StatusChip } from '../ui/status-chip';
import * as api from './camerasApi';
import { KitchenActivity, WhoIsEditor, WhoIsWho } from './KitchenActivity';
import { getTodayIST } from '../../utils/timezone';
import { useRefreshSignal } from '../shell/refreshSignal';

const ITEMS: api.PpeItem[] = ['cap', 'gloves', 'apron'];
const when = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === 'bn' ? 'bn-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function CamerasScreen() {
  const { t, lang } = useT();
  const [cams, setCams] = useState<{ cameras: api.Camera[]; canManage: boolean } | null>(null);
  const [alerts, setAlerts] = useState<api.Alert[] | null>(null);
  const [error, setError] = useState(false);
  const [edit, setEdit] = useState<api.Camera | 'new' | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'alerts' | 'activity' | 'who'>('alerts');
  const [who, setWho] = useState<api.WhoIs | null>(null);
  const loadWho = useCallback(() => { api.getWhoIs(getTodayIST()).then(setWho).catch(() => setWho(null)); }, []);
  const load = useCallback(() => {
    setError(false);
    Promise.all([api.getCameras(), api.getAlerts()]).then(([c, a]) => { setCams(c); setAlerts(a); }).catch(() => setError(true));
    loadWho();
  }, [loadWho]);
  useEffect(() => { load(); }, [load]);
  useRefreshSignal(load);
  // The Who is who tab for whoever may name people (the whois answer lists only their cameras).
  const canName = !!who?.cameras.length;

  const mark = async (a: api.Alert, m: 'correct' | 'false' | 'staff') => {
    try {
      await api.markAlert(a.id, m);
      setAlerts((list) => list && list.map((x) => (x.id === a.id ? { ...x, mark: m } : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('cam.failed'));
    }
  };

  if (error) return <Page><ErrorState onRetry={load} /></Page>;
  if (!cams || !alerts) return <Page><p className="text-body-sm text-text-3">…</p></Page>;

  return (
    <Page>
      {tab !== 'who' && <WhoIsWho data={who} onSaved={loadWho} onEdit={() => setTab('who')} />}
      {(cams.canManage || canName) && (
        <SegmentedControl aria-label={t('cam.cameras')} value={tab} onValueChange={(v) => { setTab(v); if (v !== 'who') loadWho(); }}
          options={[
            { value: 'alerts' as const, label: t('cam.alerts') },
            ...(cams.canManage ? [{ value: 'activity' as const, label: 'Activity' }] : []),
            { value: 'who' as const, label: t('cam.whoTab') },
          ]} />
      )}
      {tab === 'who' ? <WhoIsEditor /> : tab === 'activity' && cams.canManage ? <KitchenActivity /> : (<>
      <ListGroup
        title={t('cam.cameras')}
        action={cams.canManage ? <Button size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => setEdit('new')}>{t('cam.add')}</Button> : undefined}
        empty={<EmptyState compact icon={CameraIcon} title={t('cam.none')} />}
      >
        {cams.cameras.map((c) => (
          <ListRow
            key={c.id}
            icon={CameraIcon}
            title={c.name}
            subtitle={[c.place, t('cam.hours', { from: c.from, to: c.to }), c.checks.length ? t('cam.every', { n: c.everyMin }) : null, c.afterHours === false ? t('cam.noNight') : null, c.lastSeenAt ? t('cam.lastSeen', { when: when(c.lastSeenAt, lang) }) : t('cam.neverSeen')].filter(Boolean).join(' · ')}
            chip={!c.active ? <StatusChip tone="neutral" size="sm">{t('cam.paused')}</StatusChip> : c.online ? <StatusChip tone="success" size="sm">{t('cam.online')}</StatusChip> : <StatusChip tone="warning" size="sm">{t('cam.offline')}</StatusChip>}
            onClick={cams.canManage ? () => setEdit(c) : undefined}
          />
        ))}
      </ListGroup>

      <section className="flex flex-col gap-3">
        <h2 className="text-subtitle font-semibold text-text">{t('cam.alerts')}</h2>
        {alerts.length === 0 ? (
          <EmptyState compact icon={ShieldAlert} title={t('cam.noAlerts')} body={t('cam.noAlertsBody')} />
        ) : alerts.map((a) => (
          <article key={a.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-body-md font-semibold text-text">{a.kind === 'intruder' ? t('cam.afterHours') : t('cam.ppeMissing')}</span>
                <span className="text-body-sm text-text-2">{a.text} · {a.cameraName} · {when(a.at, lang)}</span>
                {(!!a.seen?.length || !!a.unknownFaces) && <span className="text-body-sm text-text-2">{t('cam.seen', { names: [...(a.seen || []), ...(a.unknownFaces ? [t('cam.unknownFaces', { n: a.unknownFaces })] : [])].join(', ') })}</span>}
                {!!a.onShift?.length && <span className="text-body-sm text-text-2">{t('cam.onShift', { names: a.onShift.join(', ') })}</span>}
              </span>
              <StatusChip tone={a.kind === 'intruder' ? 'danger' : 'warning'} size="sm">{a.kind === 'intruder' ? t('cam.urgent') : 'PPE'}</StatusChip>
            </div>
            {a.photoUrl && <img src={a.photoUrl} alt={a.note || t('cam.photo')} className="w-full rounded-md bg-surface-2" loading="lazy" />}
            {a.mark ? (
              <span className="text-body-sm text-text-2">{t('cam.marked', { what: a.mark === 'correct' ? t('cam.correct') : a.mark === 'staff' ? t('cam.oneOfUs') : t('cam.falseAlarm') })}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" leadingIcon={<CheckCircle2 />} onClick={() => mark(a, 'correct')}>{t('cam.correct')}</Button>
                {a.kind === 'intruder' && <Button size="sm" variant="secondary" onClick={() => mark(a, 'staff')}>{t('cam.oneOfUs')}</Button>}
                <Button size="sm" variant="ghost" leadingIcon={<XCircle />} onClick={() => mark(a, 'false')}>{t('cam.falseAlarm')}</Button>
              </div>
            )}
          </article>
        ))}
      </section>

      </>)}

      {edit && <CameraSheet camera={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={(k) => { setEdit(null); if (k) setKey(k); load(); }} />}
      <ResponsiveModal open={!!key} onOpenChange={(o) => !o && setKey(null)} title="Camera key">
        <div className="flex flex-col gap-4">
          <Callout tone="warning" title="Shown once">Put it in the camera PC's settings file (camera_watch.ini, key =). Anyone with it can send pictures as this camera.</Callout>
          <code className="break-all rounded-md bg-surface-2 p-3 text-body-sm">{key}</code>
          <Button
            leadingIcon={<Copy />}
            onClick={async () => {
              try { await navigator.clipboard.writeText(key || ''); toast.success('Copied'); } catch { toast.error('Could not copy - select the key and copy it'); }
            }}
          >
            Copy key
          </Button>
        </div>
      </ResponsiveModal>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-4 lg:px-8">{children}</div>;
}

// Owner: a camera's name, place, what it checks, working hours and how often (English, like the
// other set-up screens).
function CameraSheet({ camera, onClose, onSaved }: { camera: api.Camera | null; onClose: () => void; onSaved: (key?: string) => void }) {
  const { stores, context } = useShell();
  const houses = (context.productionHouses || []) as { id: string; name: string }[];
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<api.CameraDraft>(() => camera
    ? { name: camera.name, placeKind: camera.placeKind, placeId: camera.placeId, checks: camera.checks, from: camera.from, to: camera.to, everyMin: camera.everyMin, active: camera.active, afterHours: camera.afterHours !== false }
    : { name: '', placeKind: 'production', placeId: houses[0]?.id || '', checks: [...ITEMS], from: '07:00', to: '21:00', everyMin: 30, active: true, afterHours: true });
  const places = [...houses.map((h) => ({ value: `production:${h.id}`, label: h.name })), ...(stores || []).map((s) => ({ value: `store:${s.id}`, label: s.name }))];
  const save = async () => {
    setBusy(true);
    try {
      if (camera) { await api.updateCamera(camera.id, d); onSaved(); }
      else { const r = await api.addCamera(d); onSaved(r.key); }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const rotate = async () => {
    if (!camera) return;
    setBusy(true);
    try { onSaved((await api.newKey(camera.id)).key); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not change the key'); } finally { setBusy(false); }
  };
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      onClosed={onClose}
      title={camera ? camera.name : 'Add camera'}
      footer={<Button size="lg" className="flex-1" loading={busy} onClick={save}>{camera ? 'Save' : 'Add camera'}</Button>}
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required><Input value={d.name} maxLength={40} placeholder="Kitchen camera" onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
        <Field label="Place">
          <NativeSelect value={`${d.placeKind}:${d.placeId}`} onChange={(e) => { const [k, ...id] = e.target.value.split(':'); setD({ ...d, placeKind: k as 'production' | 'store', placeId: id.join(':') }); }}>
            {places.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </NativeSelect>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-text">Check in working hours</legend>
          {ITEMS.map((i) => (
            <label key={i} className="flex min-h-11 items-center gap-3 text-body-md text-text">
              <Checkbox checked={d.checks.includes(i)} onCheckedChange={(v) => setD({ ...d, checks: v === true ? [...d.checks, i] : d.checks.filter((x) => x !== i) })} />
              {i === 'cap' ? 'Cap or hairnet' : i === 'gloves' ? 'Gloves' : 'Apron'}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Working hours from"><Input type="time" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} /></Field>
          <Field label="to"><Input type="time" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} /></Field>
        </div>
        <Field label={camera?.activity ? 'Wait between bursts (minutes)' : 'Check every (minutes)'}
          helper={camera?.activity ? 'Kitchen activity camera: each check is a burst of 20 frames, 15 seconds apart (5 minutes), then it waits this long.' : undefined}>
          <Input type="number" inputMode="numeric" min={5} max={240} value={String(d.everyMin)} onChange={(e) => setD({ ...d, everyMin: Number(e.target.value) || 30 })} />
        </Field>
        <label className="flex min-h-11 items-start gap-3 text-body-md text-text">
          <Checkbox className="mt-0.5" checked={d.afterHours !== false} onCheckedChange={(v) => setD({ ...d, afterHours: v === true })} />
          <span className="flex flex-col">
            Watch for people after working hours
            <span className="text-body-sm text-text-2">Only when the camera PC stays on at night. Anyone in view is an alert unless they are checked in there or recognised.</span>
          </span>
        </label>
        {camera && (
          <>
            <label className="flex min-h-11 items-center gap-3 text-body-md text-text">
              <Checkbox checked={d.active !== false} onCheckedChange={(v) => setD({ ...d, active: v === true })} />
              Camera on (untick to pause the checks)
            </label>
            <Button variant="secondary" leadingIcon={<KeyRound />} onClick={rotate} disabled={busy}>New key (ends ••••{camera.keyHint})</Button>
          </>
        )}
        {!camera && <p className="flex items-center gap-2 text-body-sm text-text-2"><Pencil className="size-4" aria-hidden="true" />The key is shown once after adding.</p>}
      </div>
    </ResponsiveModal>
  );
}

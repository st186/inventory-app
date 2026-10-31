// Groups people make themselves (owner, 1 Nov 2026: "How to form new groups choose people remove
// people remove group edit group name"): the new-group form and a group's info sheet - rename, add
// or take out people, leave, delete. The server (chat.ts /chat/groups) decides who may do what: the
// person who made a group, the owner and operations; the automatic groups follow the staff list and
// can only be renamed.
import { useEffect, useState } from 'react';
import { LogOut, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { useT } from '../../utils/i18n';
import * as api from '../../utils/api';
import { InitialsAvatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { confirm } from '../ui/confirm';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton } from '../ui/skeleton';
import { toast } from '../ui/sonner';

type Person = { userId: string; name: string; role: string };

/** Tick people from a list, with a name search. */
function PeoplePicker({ people, picked, onChange }: { people: Person[]; picked: Set<string>; onChange: (next: Set<string>) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const shown = people.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.search')} aria-label={t('chat.search')} />
      <ul className="flex flex-col divide-y divide-border">
        {shown.map((p) => (
          <li key={p.userId}>
            <label className="flex cursor-pointer items-center gap-3 py-2.5">
              <Checkbox checked={picked.has(p.userId)} onCheckedChange={() => toggle(p.userId)} aria-label={p.name} />
              <InitialsAvatar name={p.name} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-md font-medium text-text">{p.name}</span>
                <span className="text-label text-text-3">{p.role}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The new-group form, inside the New message sheet. */
export function NewGroupForm({ token, onMade, onCancel }: { token?: string; onMade: (roomId: string) => void; onCancel: () => void }) {
  const { t } = useT();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.chatPeople(token).then((r) => setPeople(r.people)).catch(() => setPeople([])); }, [token]);
  const make = async () => {
    setBusy(true);
    try { onMade((await api.chatCreateGroup(name.trim(), [...picked], token)).roomId); } catch (e) { toast.error(e instanceof Error ? e.message : t('chat.failed')); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-label font-medium text-text-2">{t('chat.groupName')}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder={t('chat.groupNameHint')} autoFocus />
      </label>
      <span className="text-label font-medium text-text-2">{picked.size ? t('chat.picked', { n: picked.size }) : t('chat.pickPeople')}</span>
      {people === null ? <Skeleton className="h-40 w-full rounded-lg" /> : <PeoplePicker people={people} picked={picked} onChange={setPicked} />}
      <div className="sticky bottom-0 flex gap-2 bg-surface py-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('chat.back')}</Button>
        <Button className="flex-1" onClick={make} loading={busy} disabled={!name.trim() || picked.size === 0}>{t('chat.createGroup')}</Button>
      </div>
    </div>
  );
}

/** A group's name and people, and what this person may change. */
export function GroupInfoSheet({ roomId, open, onOpenChange, token, onChanged, onGone }: {
  roomId: string; open: boolean; onOpenChange: (o: boolean) => void; token?: string;
  onChanged: () => void; // name or people changed
  onGone: () => void; // left or deleted
}) {
  const { t } = useT();
  const [info, setInfo] = useState<api.ChatGroupInfo | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const load = () => api.chatGroupInfo(roomId, token).then(setInfo).catch((e) => toast.error(e instanceof Error ? e.message : t('chat.failed')));
  useEffect(() => { if (open) { setInfo(null); setRenaming(null); setAdding(null); void load(); } }, [open, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (work: () => Promise<unknown>, after: () => void) => {
    setBusy(true);
    try { await work(); after(); } catch (e) { toast.error(e instanceof Error ? e.message : t('chat.failed')); } finally { setBusy(false); }
  };
  const saveName = () => renaming?.trim() && run(() => api.chatRenameGroup(roomId, renaming.trim(), token), () => { setRenaming(null); void load(); onChanged(); });
  const startAdding = async () => {
    const all = (await api.chatPeople(token).catch(() => ({ people: [] as Person[] }))).people;
    const inIt = new Set((info?.members || []).map((m) => m.userId));
    setPicked(new Set());
    setAdding(all.filter((p) => !inIt.has(p.userId)));
  };
  const addPicked = () => run(() => api.chatGroupMembers(roomId, { add: [...picked] }, token), () => { setAdding(null); void load(); onChanged(); });
  const remove = async (m: api.ChatGroupInfo['members'][number]) => {
    if (!(await confirm({ title: t('chat.removeQ', { name: m.name }), confirmLabel: t('chat.remove'), tone: 'danger' }))) return;
    await run(() => api.chatGroupMembers(roomId, { remove: [m.userId] }, token), () => { void load(); onChanged(); });
  };
  const leave = async () => {
    if (!(await confirm({ title: t('chat.leaveQ'), body: t('chat.leaveBody'), confirmLabel: t('chat.leave'), tone: 'danger' }))) return;
    await run(() => api.chatLeaveGroup(roomId, token), () => { onOpenChange(false); onGone(); });
  };
  const del = async () => {
    if (!(await confirm({ title: t('chat.deleteQ'), body: t('chat.deleteBody'), confirmLabel: t('chat.deleteGroup'), tone: 'danger' }))) return;
    await run(() => api.chatDeleteGroup(roomId, token), () => { onOpenChange(false); onGone(); });
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('chat.groupInfo')} size="detail">
      {!info ? <Skeleton className="h-48 w-full rounded-lg" /> : adding ? (
        <div className="flex flex-col gap-3">
          {adding.length === 0 ? <p className="text-body-sm text-text-2">{t('chat.everyoneIn')}</p> : <PeoplePicker people={adding} picked={picked} onChange={setPicked} />}
          <div className="sticky bottom-0 flex gap-2 bg-surface py-2">
            <Button variant="ghost" onClick={() => setAdding(null)} disabled={busy}>{t('chat.back')}</Button>
            <Button className="flex-1" onClick={addPicked} loading={busy} disabled={picked.size === 0}>{picked.size ? `${t('chat.add')} (${picked.size})` : t('chat.add')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {renaming !== null ? (
            <div className="flex items-center gap-2">
              <Input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={50} aria-label={t('chat.groupName')} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); }} />
              <Button onClick={() => void saveName()} loading={busy} disabled={!renaming.trim()}>{t('chat.save')}</Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-title font-semibold text-text">{info.name}</span>
              {info.canRename && <IconButton label={t('chat.rename')} icon={<Pencil />} onClick={() => setRenaming(info.name)} />}
            </div>
          )}
          <p className="text-body-sm text-text-2">{info.automatic ? t('chat.autoGroupNote') : info.madeBy ? t('chat.madeBy', { name: info.madeBy }) : ''}</p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-label font-medium text-text-2">{t('chat.membersN', { n: info.members.length })}</span>
            {info.canChangePeople && <Button size="sm" variant="secondary" leadingIcon={<UserPlus />} onClick={() => void startAdding()}>{t('chat.addPeople')}</Button>}
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {info.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2.5">
                <InitialsAvatar name={m.name} size={40} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-md font-medium text-text">{m.me ? `${m.name} (${t('chat.you')})` : m.name}</span>
                  <span className="text-label text-text-3">{m.madeIt ? `${m.role} · ${t('chat.madeIt')}` : m.role}</span>
                </span>
                {info.canChangePeople && !m.me && <IconButton label={`${t('chat.remove')} ${m.name}`} icon={<X />} onClick={() => void remove(m)} disabled={busy} />}
              </li>
            ))}
          </ul>

          {(info.canLeave || info.canDelete) && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {info.canLeave && <Button variant="ghost" className="justify-start text-danger" leadingIcon={<LogOut />} onClick={() => void leave()} disabled={busy}>{t('chat.leave')}</Button>}
              {info.canDelete && <Button variant="ghost" className="justify-start text-danger" leadingIcon={<Trash2 />} onClick={() => void del()} disabled={busy}>{t('chat.deleteGroup')}</Button>}
            </div>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

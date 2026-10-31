// Team chat (owner, 1 Nov 2026: "Can we have chat included in this app" -> groups + direct): the
// rooms (the whole team, each store, each production house, and one-to-ones), and a room with text,
// photos and voice notes. A notification opens its room (route param highlight = the room id).
// Everything is read and sent through chatApi.ts; new messages arrive live.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Mic, PenSquare, Send, Square, Users, X } from 'lucide-react';
import { useT } from '../../utils/i18n';
import * as api from '../../utils/api';
import { compressPhoto } from '../assets/assetsApi';
import { useShell } from '../shell/ShellContext';
import { InitialsAvatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton } from '../ui/skeleton';
import { toast } from '../ui/sonner';
import * as chat from './chatApi';
import { EVERYONE, insertMention, mentionQuery, mentionsIn, splitMentions, type Member } from './mentions';

const SYNC_KEY = 'bunny-chat-synced';
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toLowerCase();
const dayKey = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);

export function ChatScreen({ params }: { params: Record<string, string> }) {
  const { t } = useT();
  const { user } = useShell();
  const token = user.accessToken || undefined;
  const [rooms, setRooms] = useState<chat.ChatRoom[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.highlight || null);
  const [me, setMe] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const loadRooms = useCallback(() => chat.myRooms().then(setRooms).catch(() => setRooms((r) => r || [])), []);
  useEffect(() => {
    chat.myUserId().then(setMe);
    // The groups are set up by the server; at most every 10 minutes from this phone.
    let last = 0;
    try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { /* private window */ }
    const sync = Date.now() - last > 10 * 60 * 1000
      ? api.chatSync(token).then(() => { try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* ignore */ } }).catch(() => undefined)
      : Promise.resolve();
    sync.finally(loadRooms);
  }, [token, loadRooms]);
  useEffect(() => { if (params.highlight) setOpenId(params.highlight); }, [params.highlight]);

  // Any new message: the list's last line and unread counts change.
  const pending = useRef<number | null>(null);
  chat.useNewMessages(() => {
    if (pending.current) return;
    pending.current = window.setTimeout(() => { pending.current = null; loadRooms(); }, 800);
  });

  const open = rooms?.find((r) => r.id === openId) || null;
  if (openId) {
    return (
      <RoomView
        roomId={openId}
        room={open}
        me={me}
        onBack={() => { setOpenId(null); loadRooms(); }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-text-2">{t('chat.intro')}</p>
        <Button size="sm" leadingIcon={<PenSquare />} onClick={() => setNewOpen(true)}>{t('chat.new')}</Button>
      </div>
      {rooms === null ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
      ) : rooms.length === 0 ? (
        <EmptyState icon={Users} title={t('chat.noRooms')} body={t('chat.noRoomsBody')} />
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {rooms.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                {r.kind === 'direct'
                  ? <InitialsAvatar name={r.name} size={40} />
                  : <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"><Users className="size-5" aria-hidden="true" /></span>}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-body-md ${r.unread ? 'font-semibold text-text' : 'font-medium text-text'}`}>{r.name}</span>
                    {r.last_at && <span className="num shrink-0 text-label text-text-3">{dayKey(r.last_at) === dayKey(new Date().toISOString()) ? timeOf(r.last_at) : new Date(r.last_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-body-sm ${r.unread ? 'text-text' : 'text-text-3'}`}>
                      {r.last_at ? `${r.kind !== 'direct' && r.last_sender ? `${r.last_sender}: ` : ''}${preview(t, r.last_kind, r.last_body)}` : r.kind === 'direct' ? t('chat.sayHi') : t('chat.membersN', { n: r.members })}
                    </span>
                    {r.unread > 0 && <span className="num flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-label font-semibold text-on-primary">{r.unread > 99 ? '99+' : r.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <NewMessageSheet open={newOpen} onOpenChange={setNewOpen} token={token} onOpened={(roomId) => { setNewOpen(false); setOpenId(roomId); loadRooms(); }} />
    </div>
  );
}

function preview(t: ReturnType<typeof useT>['t'], kind: string | null, body: string | null) {
  if (kind === 'photo') return `📷 ${body || t('chat.photo')}`;
  if (kind === 'voice') return `🎤 ${t('chat.voiceNote')}`;
  return body || '';
}

function NewMessageSheet({ open, onOpenChange, token, onOpened }: { open: boolean; onOpenChange: (o: boolean) => void; token?: string; onOpened: (roomId: string) => void }) {
  const { t } = useT();
  const [people, setPeople] = useState<{ userId: string; name: string; role: string }[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (open && !people) api.chatPeople(token).then((r) => setPeople(r.people)).catch(() => setPeople([])); }, [open, people, token]);
  const shown = (people || []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = async (userId: string) => {
    setBusy(userId);
    try { onOpened((await api.chatDirect(userId, token)).roomId); } catch (e) { toast.error(e instanceof Error ? e.message : t('chat.failed')); } finally { setBusy(null); }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t('chat.new')} size="detail">
      <div className="flex flex-col gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.search')} aria-label={t('chat.search')} />
        {people === null ? <Skeleton className="h-40 w-full rounded-lg" /> : (
          <ul className="flex flex-col divide-y divide-border">
            {shown.map((p) => (
              <li key={p.userId}>
                <button type="button" disabled={!!busy} onClick={() => pick(p.userId)} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-60">
                  <InitialsAvatar name={p.name} size={40} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-md font-medium text-text">{p.name}</span>
                    <span className="text-label text-text-3">{p.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResponsiveModal>
  );
}

function RoomView({ roomId, room, me, onBack }: { roomId: string; room: chat.ChatRoom | null; me: string | null; onBack: () => void }) {
  const { t } = useT();
  const [msgs, setMsgs] = useState<chat.ChatMessage[] | null>(null);
  const [more, setMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastRead = useRef(0);
  // @mentions (owner, 1 Nov 2026): the room's people, and the @word being typed.
  const [people, setPeople] = useState<Member[]>([]);
  const [caret, setCaret] = useState(0);
  useEffect(() => { chat.members(roomId).then(setPeople).catch(() => setPeople([])); }, [roomId]);

  const read = useCallback(() => {
    if (Date.now() - lastRead.current < 4000) return;
    lastRead.current = Date.now();
    chat.markRead(roomId).then(chat.chatReadChanged).catch(() => undefined);
  }, [roomId]);
  const add = useCallback((list: chat.ChatMessage[]) => setMsgs((cur) => {
    const byId = new Map((cur || []).map((m) => [m.id, m]));
    for (const m of list) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }), []);

  useEffect(() => {
    setMsgs(null);
    chat.messages(roomId).then((list) => { setMsgs(list); setMore(list.length >= chat.PAGE); lastRead.current = 0; read(); }).catch(() => setMsgs([]));
  }, [roomId, read]);
  chat.useNewMessages((m) => { if (m.room_id === roomId) { add([m]); read(); } });
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);

  const earlier = async () => {
    if (!msgs?.length) return;
    const list = await chat.messages(roomId, msgs[0].created_at).catch(() => []);
    setMore(list.length >= chat.PAGE);
    add(list);
  };
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try { add([await chat.sendText(roomId, text, mentionsIn(text, people, me))]); setText(''); } catch (e) { toast.error(e instanceof Error ? e.message : t('chat.failed')); } finally { setSending(false); }
  };
  const sendPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSending(true);
    try { add([await chat.sendMedia(roomId, 'photo', chat.dataUrlToBlob(await compressPhoto(file)), { body: text, mentions: mentionsIn(text, people, me) })]); setText(''); } catch (err) { toast.error(err instanceof Error ? err.message : t('chat.failed')); } finally { setSending(false); }
  };

  const days = useMemo(() => {
    const out: { day: string; list: chat.ChatMessage[] }[] = [];
    for (const m of msgs || []) {
      const d = dayKey(m.created_at);
      if (out[out.length - 1]?.day !== d) out.push({ day: d, list: [] });
      out[out.length - 1].list.push(m);
    }
    return out;
  }, [msgs]);
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  const group = room?.kind !== 'direct';
  const typing = group ? mentionQuery(text, caret) : null;
  const suggestions = typing
    ? [{ user_id: '*', name: EVERYONE }, ...people.filter((p) => p.user_id !== me)]
      .filter((p) => p.name.toLowerCase().includes(typing.query.toLowerCase())).slice(0, 6)
    : [];
  const pickMention = (name: string) => {
    if (!typing) return;
    const next = insertMention(text, typing.start, caret, name);
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => { box.current?.focus(); box.current?.setSelectionRange(next.caret, next.caret); });
  };
  const names = people.map((p) => p.name);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-2 py-2">
        <IconButton label={t('chat.back')} icon={<ArrowLeft />} onClick={onBack} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-body-md font-semibold text-text">{room?.name || t('chat.title')}</span>
          {group && room && <span className="text-label text-text-3">{t('chat.membersN', { n: room.members })}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3">
        {more && <Button size="sm" variant="ghost" className="self-center" onClick={earlier}>{t('chat.earlier')}</Button>}
        {msgs === null && <Skeleton className="h-40 w-full rounded-lg" />}
        {msgs?.length === 0 && <EmptyState compact icon={Users} title={t('chat.empty')} />}
        {days.map(({ day, list }) => (
          <div key={day} className="flex flex-col gap-1.5">
            <span className="self-center rounded-full bg-surface-2 px-2.5 py-0.5 text-label text-text-3">
              {day === today ? t('chat.today') : day === yesterday ? t('chat.yesterday') : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </span>
            {list.map((m, i) => {
              const mine = m.sender_id === me;
              const showName = group && !mine && list[i - 1]?.sender_id !== m.sender_id;
              const forMe = !mine && !!me && (m.mentions || []).includes(me);
              return (
                <div key={m.id} className={`flex max-w-[85%] flex-col ${mine ? 'items-end self-end' : 'items-start self-start'}`}>
                  {showName && <span className="px-1 text-label font-medium text-primary">{m.sender_name}</span>}
                  <div className={`flex flex-col gap-1 rounded-2xl px-3 py-2 ${mine ? 'rounded-br-md bg-primary-soft text-text' : 'rounded-bl-md border border-border bg-surface text-text'} ${forMe ? 'ring-2 ring-primary' : ''}`}>
                    {m.kind === 'photo' && (m.media_path || m.media_archived_at) && <PhotoMessage message={m} onOpen={setViewing} />}
                    {m.kind === 'voice' && (m.media_path || m.media_archived_at) && <VoiceMessage message={m} />}
                    {m.body && (
                      <span className="whitespace-pre-wrap break-words text-body-md">
                        {splitMentions(m.body, names).map((part, k) => (part.mention ? <span key={k} className="font-semibold text-primary">{part.text}</span> : part.text))}
                      </span>
                    )}
                    <span className="num self-end text-[11px] leading-none text-text-3">{timeOf(m.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {suggestions.length > 0 && (
        <ul className="sticky bottom-[60px] mx-2 flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-md" role="listbox" aria-label={t('chat.mention')}>
          {suggestions.map((p) => (
            <li key={p.user_id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(p.name)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2">
                {p.user_id === '*'
                  ? <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary"><Users className="size-4" aria-hidden="true" /></span>
                  : <InitialsAvatar name={p.name} size={32} />}
                <span className="text-body-sm font-medium text-text">{p.user_id === '*' ? t('chat.everyone') : p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="sticky bottom-0 flex items-end gap-2 border-t border-border bg-surface px-2 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <IconButton label={t('chat.photo')} icon={<Camera />} onClick={() => photoInput.current?.click()} disabled={sending} />
        <input ref={photoInput} type="file" accept="image/*" className="sr-only" onChange={sendPhoto} />
        <textarea
          ref={box}
          value={text}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); }}
          onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }}
          rows={1}
          maxLength={2000}
          placeholder={t('chat.write')}
          aria-label={t('chat.write')}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface-2 px-3.5 py-2.5 text-body-md text-text outline-none placeholder:text-text-3 focus-visible:ring-2 focus-visible:ring-ring"
        />
        {text.trim()
          ? <IconButton label={t('chat.send')} icon={<Send />} variant="primary" loading={sending} onClick={send} />
          : <VoiceButton roomId={roomId} onSent={(m) => add([m])} />}
      </div>
      <ResponsiveModal open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }} title={t('chat.photo')} size="detail">
        {viewing && <img src={viewing} alt="" className="w-full rounded-lg" />}
      </ResponsiveModal>
    </div>
  );
}

function PhotoMessage({ message, onOpen }: { message: chat.ChatMessage; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { chat.mediaUrl(message).then(setUrl); }, [message]);
  if (!url) return <Skeleton className="h-40 w-56 rounded-xl" />;
  return (
    <button type="button" onClick={() => onOpen(url)} className="overflow-hidden rounded-xl">
      <img src={url} alt="" loading="lazy" className="max-h-64 w-56 object-cover" />
    </button>
  );
}

function VoiceMessage({ message }: { message: chat.ChatMessage }) {
  const seconds = message.media_seconds;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { chat.mediaUrl(message).then(setUrl); }, [message]);
  return (
    <div className="flex items-center gap-2">
      {url ? <audio controls preload="none" src={url} className="h-10 w-56 max-w-full" /> : <Skeleton className="h-10 w-56 rounded-full" />}
      {seconds ? <span className="num text-label text-text-3">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span> : null}
    </div>
  );
}

// Tap to record, tap to stop and send; X throws it away. Up to 2 minutes.
function VoiceButton({ roomId, onSent }: { roomId: string; onSent: (m: chat.ChatMessage) => void }) {
  const { t } = useT();
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; cancel: boolean; timer: number } | null>(null);

  const stop = (cancel: boolean) => {
    const r = rec.current;
    if (!r) return;
    r.cancel = cancel;
    window.clearInterval(r.timer);
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const r = { recorder, stream, chunks: [] as Blob[], started: Date.now(), cancel: false, timer: 0 };
      recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(false);
        rec.current = null;
        const seconds = (Date.now() - r.started) / 1000;
        if (r.cancel || seconds < 1 || !r.chunks.length) return;
        setBusy(true);
        try { onSent(await chat.sendMedia(roomId, 'voice', new Blob(r.chunks, { type: recorder.mimeType || 'audio/webm' }), { seconds })); } catch (e) { toast.error(e instanceof Error ? e.message : t('chat.failed')); } finally { setBusy(false); }
      };
      r.timer = window.setInterval(() => {
        const s = Math.floor((Date.now() - r.started) / 1000);
        setSecs(s);
        if (s >= 120) stop(false);
      }, 250);
      rec.current = r;
      setSecs(0);
      setRecording(true);
      recorder.start();
    } catch {
      toast.error(t('chat.micDenied'));
    }
  };
  useEffect(() => () => stop(true), []);

  if (recording) {
    return (
      <div className="flex items-center gap-1">
        <span className="num flex items-center gap-1.5 px-1 text-body-sm text-danger" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </span>
        <IconButton label={t('chat.cancel')} icon={<X />} onClick={() => stop(true)} />
        <IconButton label={t('chat.stopSend')} icon={<Square />} variant="primary" onClick={() => stop(false)} />
      </div>
    );
  }
  return <IconButton label={t('chat.voice')} icon={<Mic />} loading={busy} onClick={start} />;
}

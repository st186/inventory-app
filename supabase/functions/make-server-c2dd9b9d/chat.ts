// Team chat (owner, 1 Nov 2026: "Can we have chat included in this app" -> groups + direct). The
// phones read and send messages straight to the chat tables under row level security and get new
// ones over Supabase Realtime (migration 20261101020000_team_chat.sql); the server only:
//   POST /chat/sync     keeps the groups in step with the staff list (at most every 10 minutes)
//   POST /chat/direct   opens (or finds) a one-to-one room with someone
//   GET  /chat/people   who you can message
//   POST /chat/notify   called by the database after each message: phone notifications
//   /chat/groups        groups people make: new, rename, add or take out people, leave, delete
// Groups: the whole team; each store (its staff); each production house (its staff). The owner and
// operations managers are in every group. A one-to-one room has only its two people - nobody else
// can read it.
// Groups people make themselves (owner, 1 Nov 2026: "How to form new groups choose people remove
// people remove group edit group name"): anyone may make one; the person who made it, the owner and
// operations may rename it, add and take out people, and delete it; anyone may leave it. The
// automatic groups follow the staff list - the owner and operations may only rename them.
// Bunny (owner, 1 Nov 2026: "will bunny be available in chat"): a member of every group, answering
// when someone writes @Bunny, and everyone has a one-to-one chat with Bunny (room key bunny:<uid>).
import { inBackground } from './background.ts';

type Kv = { get: (k: string) => Promise<any>; set: (k: string, v: any) => Promise<void> };
export type ChatDeps = {
  kv: Kv;
  db: any; // service-role Supabase client
  verifyUser: (authHeader: string | null) => Promise<any>;
  staff: () => Promise<any[]>;
  rows: (prefix: string) => Promise<any[]>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
  /** Google Drive (gdrive.ts), where photos and voice notes go after KEEP_DAYS. */
  drive?: {
    configured: () => boolean;
    folder: (path: string[]) => Promise<string>;
    upload: (opts: { name: string; bytes: Uint8Array; mimeType: string; folderId: string }) => Promise<{ id: string }>;
    download: (id: string) => Promise<Response>;
  };
  /** Bunny's answer (insights.ts askBunnyInChat). */
  bunny?: (o: { userId: string; role: string; storeId: string | null; noMoney: boolean; where: string; messages: { role: 'user' | 'assistant'; content: string }[] }) => Promise<string>;
};
/** Bunny's place in the chat tables: a fixed id that is no one's sign-in. */
export const BUNNY_ID = '00000000-0000-4000-8000-00000000b0b0';
const BUNNY_NAME = 'Bunny';
/** Photos and voice notes stay in Supabase this long, then move to Google Drive. */
export const KEEP_DAYS = 30;
const MEDIA_BUCKET = 'chat-media';

const P = '/make-server-c2dd9b9d';
const SYNC_EVERY_MS = 10 * 60 * 1000;
/** Someone who read the room this recently is looking at it: no notification. */
const READING_MS = 60 * 1000;

const DESIGNATION_WORD: Record<string, string> = {
  store_incharge: 'Store incharge', production_incharge: 'Production incharge', store_ops: 'Store', production_ops: 'Kitchen',
  rider: 'Rider', operations_incharge: 'Operations',
};
export const isLead = (u: any) => u?.role === 'cluster_head' || (u?.role === 'manager' && !['store_incharge', 'production_incharge'].includes(u?.designation));
const personName = (u: any) => String(u?.name || 'Someone').slice(0, 60);
const cleanGroupName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
/** May rename the group; for a made group also change its people and delete it. */
export const canManageGroup = (self: any, room: { kind: string; created_by?: string | null }) =>
  room.kind !== 'direct' && (isLead(self) || (room.kind === 'custom' && !!self?.authUserId && room.created_by === self.authUserId));
const active = (u: any) => !!u?.authUserId && u.status !== 'inactive' && u.designation !== 'site_auditor' && u.role !== 'audit';
const placesOf = (u: any) => ({
  stores: new Set([u.storeId, ...(u.assignedStoreIds || [])].filter(Boolean).map(String)),
  houses: new Set([u.productionHouseId, ...(u.assignedProductionHouseIds || [])].filter(Boolean).map(String)),
});
export const roleWord = (u: any) => (u?.role === 'cluster_head' ? 'Owner' : isLead(u) ? 'Operations' : DESIGNATION_WORD[u?.designation] || 'Team');

/** A one-to-one chat with Bunny as Bunny's turns (assistant) and the person's (user): starting and
 *  ending with the person, back-to-back messages of one side joined. */
export function bunnyTurns(list: { sender_id: string; kind: string; body: string }[]) {
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of list) {
    const role = m.sender_id === BUNNY_ID ? 'assistant' : 'user';
    const content = m.kind === 'photo' ? `[photo] ${m.body || ''}`.trim() : m.kind === 'voice' ? '[voice note]' : m.body;
    if (!content) continue;
    if (!turns.length && role === 'assistant') continue;
    if (turns[turns.length - 1]?.role === role) turns[turns.length - 1].content += `\n${content}`;
    else turns.push({ role, content });
  }
  while (turns.length && turns[turns.length - 1].role === 'assistant') turns.pop();
  return turns;
}

/** The groups and who is in each, from the staff list. */
export function groupsFor(staff: any[], stores: any[], houses: any[]) {
  const people = staff.filter(active);
  const leads = people.filter(isLead);
  const groups: { key: string; name: string; members: any[] }[] = [{ key: 'team', name: 'Bunny Momos team', members: people }];
  for (const st of stores) {
    // A production house's id was once stored as a store id (bunny-production-house-id): those
    // people belong with the house, not this store.
    const members = people.filter((u) => !isLead(u) && placesOf(u).stores.has(String(st.id)) && !['production_incharge', 'production_ops'].includes(u.designation));
    groups.push({ key: `store:${st.id}`, name: st.name || 'Store', members: [...leads, ...members] });
  }
  for (const h of houses) {
    const storeIds = new Set(stores.filter((s) => s.productionHouseId === h.id).map((s) => String(s.id)));
    const members = people.filter((u) => !isLead(u) && (placesOf(u).houses.has(String(h.id)) || (['production_incharge', 'production_ops'].includes(u.designation) && [...placesOf(u).stores].some((id) => storeIds.has(id) || id === String(h.id)))));
    groups.push({ key: `production:${h.id}`, name: h.name || 'Production house', members: [...leads, ...members] });
  }
  return groups.map((g) => ({ ...g, members: [...new Map(g.members.map((u) => [u.authUserId, u])).values()] }));
}

export function registerChatRoutes(app: any, deps: ChatDeps) {
  const me = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const staff = await deps.staff();
    const self = staff.find((u: any) => u.authUserId === auth.user.id);
    if (!self || !active(self)) return { error: c.json({ error: 'Chat is for the team' }, 403) };
    return { self, staff };
  };

  async function sync(staff: any[]) {
    const stores = (await deps.rows('store:')).filter((s: any) => s?.id && s.status !== 'inactive' && s.status !== 'closed');
    const houses = (await deps.rows('production_house_')).filter((h: any) => h?.id && h.status !== 'inactive');
    const groups = groupsFor(staff, stores, houses);
    // A group the owner renamed keeps its new name.
    const { data: renamedRooms } = await deps.db.from('chat_rooms').select('key').in('key', groups.map((g) => g.key)).eq('renamed', true);
    const keepName = new Set((renamedRooms || []).map((r: any) => r.key));
    const toSave = groups.filter((g) => !keepName.has(g.key));
    if (toSave.length) {
      const { error: roomErr } = await deps.db.from('chat_rooms').upsert(toSave.map((g) => ({ key: g.key, kind: g.key === 'team' ? 'team' : 'place', name: g.name })), { onConflict: 'key' });
      if (roomErr) throw new Error(roomErr.message);
    }
    const { data: rooms, error: readErr } = await deps.db.from('chat_rooms').select('id,key').in('key', groups.map((g) => g.key));
    if (readErr) throw new Error(readErr.message);
    const idOf = new Map((rooms || []).map((r: any) => [r.key, r.id]));
    for (const g of groups) {
      const roomId = idOf.get(g.key);
      if (!roomId) continue;
      const rows = g.members.map((u: any) => ({ room_id: roomId, user_id: u.authUserId, name: String(u.name || 'Someone').slice(0, 60) }));
      rows.push({ room_id: roomId, user_id: BUNNY_ID, name: BUNNY_NAME });
      // Names updated, read marks kept; people no longer in the group taken out.
      if (rows.length) {
        const { error } = await deps.db.from('chat_members').upsert(rows, { onConflict: 'room_id,user_id', ignoreDuplicates: false });
        if (error) throw new Error(error.message);
      }
      const keep = rows.map((r: any) => r.user_id);
      let del = deps.db.from('chat_members').delete().eq('room_id', roomId);
      if (keep.length) del = del.not('user_id', 'in', `(${keep.join(',')})`);
      const { error: delErr } = await del;
      if (delErr) throw new Error(delErr.message);
    }
    // Everyone's one-to-one chat with Bunny.
    const people = staff.filter(active);
    // Someone who left the team leaves the groups people made too.
    const { data: madeRooms } = await deps.db.from('chat_rooms').select('id').eq('kind', 'custom');
    if (madeRooms?.length) {
      const { error } = await deps.db.from('chat_members').delete().in('room_id', madeRooms.map((r: any) => r.id))
        .not('user_id', 'in', `(${[...people.map((u: any) => u.authUserId), BUNNY_ID].join(',')})`);
      if (error) throw new Error(error.message);
    }
    if (people.length) {
      const { error: bErr } = await deps.db.from('chat_rooms').upsert(people.map((u: any) => ({ key: `bunny:${u.authUserId}`, kind: 'direct', name: BUNNY_NAME })), { onConflict: 'key', ignoreDuplicates: true });
      if (bErr) throw new Error(bErr.message);
      const { data: bunnyRooms, error: bRead } = await deps.db.from('chat_rooms').select('id,key').in('key', people.map((u: any) => `bunny:${u.authUserId}`));
      if (bRead) throw new Error(bRead.message);
      const nameOf = new Map(people.map((u: any) => [u.authUserId, String(u.name || 'Someone').slice(0, 60)]));
      const rows = (bunnyRooms || []).flatMap((r: any) => {
        const uid = r.key.slice('bunny:'.length);
        return [{ room_id: r.id, user_id: uid, name: nameOf.get(uid) || 'Someone' }, { room_id: r.id, user_id: BUNNY_ID, name: BUNNY_NAME }];
      });
      if (rows.length) {
        const { error } = await deps.db.from('chat_members').upsert(rows, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
    }
    await deps.kv.set('chat-sync:last', { at: new Date().toISOString(), groups: groups.length });
    return groups.length;
  }

  app.post(`${P}/chat/sync`, async (c: any) => {
    // The server itself (X-Cron-Secret) may set the groups up too, without anyone signed in.
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    const fromServer = !!secret && c.req.header('X-Cron-Secret') === secret;
    const w: any = fromServer ? { staff: await deps.staff() } : await me(c);
    if (w.error) return w.error;
    try {
      const last = await deps.kv.get('chat-sync:last');
      if (last?.at && Date.now() - Date.parse(last.at) < SYNC_EVERY_MS && c.req.query('force') !== '1') return c.json({ success: true, skipped: true });
      return c.json({ success: true, groups: await sync(w.staff) });
    } catch (error: any) {
      console.error('Chat sync failed:', error);
      return c.json({ error: 'Could not set up the chat groups' }, 500);
    }
  });

  app.get(`${P}/chat/people`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const people = w.staff.filter((u: any) => active(u) && u.authUserId !== w.self.authUserId)
      .map((u: any) => ({ userId: u.authUserId, name: String(u.name || 'Someone'), role: roleWord(u) }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return c.json({ people });
  });

  app.post(`${P}/chat/direct`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    try {
      const { userId } = await c.req.json().catch(() => ({}));
      const other = w.staff.find((u: any) => u.authUserId === userId && active(u));
      if (!other || other.authUserId === w.self.authUserId) return c.json({ error: 'Pick someone from the team' }, 400);
      const key = `direct:${[w.self.authUserId, other.authUserId].sort().join(':')}`;
      const { error: upErr } = await deps.db.from('chat_rooms').upsert({ key, kind: 'direct', name: '' }, { onConflict: 'key', ignoreDuplicates: true });
      if (upErr) throw new Error(upErr.message);
      const { data: room, error } = await deps.db.from('chat_rooms').select('id').eq('key', key).single();
      if (error || !room) throw new Error(error?.message || 'room missing');
      const { error: memErr } = await deps.db.from('chat_members').upsert([
        { room_id: room.id, user_id: w.self.authUserId, name: String(w.self.name || 'Someone').slice(0, 60) },
        { room_id: room.id, user_id: other.authUserId, name: String(other.name || 'Someone').slice(0, 60) },
      ], { onConflict: 'room_id,user_id', ignoreDuplicates: true });
      if (memErr) throw new Error(memErr.message);
      return c.json({ roomId: room.id, name: other.name });
    } catch (error: any) {
      console.error('Could not open a chat:', error);
      return c.json({ error: 'Could not open the chat' }, 500);
    }
  });

  // ---- Groups people make (see the top of this file) ----
  const loadRoom = async (id: string) => {
    const { data } = await deps.db.from('chat_rooms').select('id,key,kind,name,created_by').eq('id', id).maybeSingle();
    return data as { id: string; key: string; kind: string; name: string; created_by: string | null } | null;
  };
  const inRoom = async (roomId: string, uid: string) => {
    const { data } = await deps.db.from('chat_members').select('user_id').eq('room_id', roomId).eq('user_id', uid).maybeSingle();
    return !!data;
  };
  const tellAdded = (people: any[], by: any, room: { id: string; name: string }) => Promise.all(people.map((u) =>
    deps.notifyUser(u.authUserId, 'chat_group', `${personName(by)} added you to ${room.name}`, 'Open the chat to say hello.', room.id).catch(() => undefined)));
  // The group, for someone in it, or an error reply.
  const groupFor = async (c: any, w: any) => {
    const room = await loadRoom(c.req.param('id'));
    if (!room || room.kind === 'direct' || !(await inRoom(room.id, w.self.authUserId))) return { error: c.json({ error: 'Group not found' }, 404) };
    return { room };
  };

  app.post(`${P}/chat/groups`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const name = cleanGroupName(body.name);
      if (!name) return c.json({ error: 'Give the group a name' }, 400);
      const ids = new Set((Array.isArray(body.memberIds) ? body.memberIds : []).map(String));
      const people = w.staff.filter((u: any) => active(u) && ids.has(u.authUserId) && u.authUserId !== w.self.authUserId);
      if (!people.length) return c.json({ error: 'Pick at least one person' }, 400);
      const { data: room, error } = await deps.db.from('chat_rooms')
        .insert({ key: `group:${crypto.randomUUID()}`, kind: 'custom', name, created_by: w.self.authUserId }).select('id,name').single();
      if (error || !room) throw new Error(error?.message || 'not made');
      const rows = [w.self, ...people].map((u: any) => ({ room_id: room.id, user_id: u.authUserId, name: personName(u) }));
      rows.push({ room_id: room.id, user_id: BUNNY_ID, name: BUNNY_NAME });
      const { error: memErr } = await deps.db.from('chat_members').insert(rows);
      if (memErr) throw new Error(memErr.message);
      await tellAdded(people, w.self, room);
      return c.json({ roomId: room.id, name: room.name });
    } catch (error: any) {
      console.error('Could not make the group:', error);
      return c.json({ error: 'Could not make the group' }, 500);
    }
  });

  app.get(`${P}/chat/groups/:id`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const g: any = await groupFor(c, w);
    if (g.error) return g.error;
    const room = g.room;
    const { data: members } = await deps.db.from('chat_members').select('user_id,name').eq('room_id', room.id);
    const byId = new Map(w.staff.map((u: any) => [u.authUserId, u]));
    const manage = canManageGroup(w.self, room);
    const made = room.kind === 'custom';
    return c.json({
      id: room.id, name: room.name, automatic: !made,
      madeBy: made && room.created_by ? personName(byId.get(room.created_by)) : null,
      canRename: manage, canChangePeople: made && manage, canDelete: made && manage, canLeave: made,
      members: (members || []).filter((m: any) => m.user_id !== BUNNY_ID)
        .map((m: any) => ({ userId: m.user_id, name: m.name, role: roleWord(byId.get(m.user_id)), madeIt: m.user_id === room.created_by, me: m.user_id === w.self.authUserId }))
        .sort((a: any, b: any) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name)),
    });
  });

  app.patch(`${P}/chat/groups/:id`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const g: any = await groupFor(c, w);
    if (g.error) return g.error;
    if (!canManageGroup(w.self, g.room)) return c.json({ error: 'Only the person who made the group, the owner or operations can rename it' }, 403);
    const name = cleanGroupName((await c.req.json().catch(() => ({}))).name);
    if (!name) return c.json({ error: 'Give the group a name' }, 400);
    const { error } = await deps.db.from('chat_rooms').update({ name, renamed: g.room.kind !== 'custom' }).eq('id', g.room.id);
    if (error) return c.json({ error: 'Could not rename the group' }, 500);
    return c.json({ name });
  });

  app.post(`${P}/chat/groups/:id/members`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const g: any = await groupFor(c, w);
    if (g.error) return g.error;
    if (g.room.kind !== 'custom') return c.json({ error: 'People in this group follow the staff list' }, 400);
    if (!canManageGroup(w.self, g.room)) return c.json({ error: 'Only the person who made the group, the owner or operations can change who is in it' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const addIds = new Set((Array.isArray(body.add) ? body.add : []).map(String));
      const removeIds = (Array.isArray(body.remove) ? body.remove : []).map(String).filter((id: string) => id !== BUNNY_ID);
      const adding = w.staff.filter((u: any) => active(u) && addIds.has(u.authUserId));
      if (adding.length) {
        const { data: already } = await deps.db.from('chat_members').select('user_id').eq('room_id', g.room.id).in('user_id', adding.map((u: any) => u.authUserId));
        const have = new Set((already || []).map((m: any) => m.user_id));
        const fresh = adding.filter((u: any) => !have.has(u.authUserId));
        if (fresh.length) {
          const { error } = await deps.db.from('chat_members').insert(fresh.map((u: any) => ({ room_id: g.room.id, user_id: u.authUserId, name: personName(u) })));
          if (error) throw new Error(error.message);
          await tellAdded(fresh, w.self, g.room);
        }
      }
      if (removeIds.length) {
        const { error } = await deps.db.from('chat_members').delete().eq('room_id', g.room.id).in('user_id', removeIds);
        if (error) throw new Error(error.message);
      }
      return c.json({ success: true });
    } catch (error: any) {
      console.error('Could not change the group:', error);
      return c.json({ error: 'Could not change the group' }, 500);
    }
  });

  app.post(`${P}/chat/groups/:id/leave`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const g: any = await groupFor(c, w);
    if (g.error) return g.error;
    if (g.room.kind !== 'custom') return c.json({ error: 'You are in this group because of your work place' }, 400);
    const { error } = await deps.db.from('chat_members').delete().eq('room_id', g.room.id).eq('user_id', w.self.authUserId);
    if (error) return c.json({ error: 'Could not leave the group' }, 500);
    // The last person out: the group goes.
    const { count } = await deps.db.from('chat_members').select('user_id', { count: 'exact', head: true }).eq('room_id', g.room.id).neq('user_id', BUNNY_ID);
    if (!count) await removeRoom(g.room.id);
    return c.json({ success: true });
  });

  app.delete(`${P}/chat/groups/:id`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    const g: any = await groupFor(c, w);
    if (g.error) return g.error;
    if (g.room.kind !== 'custom') return c.json({ error: 'This group follows the staff list and cannot be deleted' }, 400);
    if (!canManageGroup(w.self, g.room)) return c.json({ error: 'Only the person who made the group, the owner or operations can delete it' }, 403);
    try {
      await removeRoom(g.room.id);
      return c.json({ success: true });
    } catch (error: any) {
      console.error('Could not delete the group:', error);
      return c.json({ error: 'Could not delete the group' }, 500);
    }
  });

  // A group's messages, people and the photos and voice notes still in Supabase (Drive copies stay).
  async function removeRoom(roomId: string) {
    const { data: files } = await deps.db.storage.from(MEDIA_BUCKET).list(roomId, { limit: 1000 });
    if (files?.length) await deps.db.storage.from(MEDIA_BUCKET).remove(files.map((f: any) => `${roomId}/${f.name}`));
    const { error } = await deps.db.from('chat_rooms').delete().eq('id', roomId);
    if (error) throw new Error(error.message);
  }

  // ---- Photos and voice notes after 30 days: to Google Drive (owner, 1 Nov 2026: "either supabase
  // will overflow"). Nightly, each one older than KEEP_DAYS is copied to Drive ("Chat/<month>/<room>")
  // and removed from Supabase's 1 GB; the chat still opens it, from Drive (GET /chat/media/:id). ----
  app.post(`${P}/cron/chat-archive`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.drive?.configured()) return c.json({ success: true, skipped: 'Google Drive is not connected' });
    const before = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    const { data: old, error } = await deps.db.from('chat_messages').select('id,room_id,kind,media_path,created_at')
      .not('media_path', 'is', null).is('media_drive_id', null).lt('created_at', before).order('created_at').limit(150);
    if (error) return c.json({ error: error.message }, 500);
    const roomNames = new Map<string, string>();
    let moved = 0, failed = 0;
    for (const m of old || []) {
      try {
        if (!roomNames.has(m.room_id)) {
          const { data: room } = await deps.db.from('chat_rooms').select('kind,name').eq('id', m.room_id).single();
          roomNames.set(m.room_id, room?.kind === 'direct' ? 'One-to-one' : String(room?.name || 'Chat').replace(/[\\/]/g, '-'));
        }
        const { data: blob, error: dlErr } = await deps.db.storage.from(MEDIA_BUCKET).download(m.media_path);
        if (dlErr || !blob) throw new Error(dlErr?.message || 'missing');
        const folderId = await deps.drive.folder(['Chat', String(m.created_at).slice(0, 7), roomNames.get(m.room_id)!]);
        const name = `${String(m.created_at).slice(0, 19).replace(/[:T]/g, '-')}-${m.kind}.${String(m.media_path).split('.').pop()}`;
        const { id } = await deps.drive.upload({ name, bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'application/octet-stream', folderId });
        const { error: upErr } = await deps.db.from('chat_messages').update({ media_drive_id: id, media_archived_at: new Date().toISOString() }).eq('id', m.id);
        if (upErr) throw new Error(upErr.message);
        await deps.db.storage.from(MEDIA_BUCKET).remove([m.media_path]);
        moved++;
      } catch (e) {
        failed++;
        console.error('Chat media not moved to Drive:', m.id, e instanceof Error ? e.message : e);
      }
    }
    return c.json({ success: true, moved, failed, more: (old || []).length === 150 });
  });

  // A photo or voice note moved to Drive, for a member of its room.
  app.get(`${P}/chat/media/:id`, async (c: any) => {
    const w: any = await me(c);
    if (w.error) return w.error;
    try {
      const { data: m } = await deps.db.from('chat_messages').select('room_id,media_drive_id,kind').eq('id', c.req.param('id')).single();
      if (!m?.media_drive_id) return c.json({ error: 'Not found' }, 404);
      const { data: member } = await deps.db.from('chat_members').select('user_id').eq('room_id', m.room_id).eq('user_id', w.self.authUserId).maybeSingle();
      if (!member) return c.json({ error: 'Not your chat' }, 403);
      const res = await deps.drive!.download(m.media_drive_id);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return c.json({ dataUrl: `data:${res.headers.get('content-type') || (m.kind === 'photo' ? 'image/jpeg' : 'audio/webm')};base64,${btoa(bin)}` });
    } catch (error: any) {
      console.error('Chat media from Drive failed:', error);
      return c.json({ error: 'Could not open it from Google Drive' }, 502);
    }
  });

  // Bunny's reply. In a group it names the person who asked, so they get their own notification.
  async function replyAsBunny(msg: any, room: any) {
    const asker = (await deps.staff()).find((u: any) => u.authUserId === msg.sender_id);
    if (!asker || !active(asker)) return;
    const direct = room.key === `bunny:${msg.sender_id}`;
    let body: string;
    if (msg.kind !== 'text') {
      body = "I can only read typed messages for now - please type your question (the keyboard's mic works too).";
    } else {
      const { data: recent } = await deps.db.from('chat_messages').select('sender_id,sender_name,kind,body,created_at')
        .eq('room_id', room.id).lte('created_at', msg.created_at).order('created_at', { ascending: false }).limit(direct ? 12 : 8);
      const list = (recent || []).reverse();
      const strip = (t: string) => t.replace(/(^|\s)@Bunny(?![\p{L}\p{N}])/giu, ' ').trim();
      const messages = direct
        ? bunnyTurns(list)
        : [{
          role: 'user' as const,
          content: `Recent messages in the group:\n${list.slice(0, -1).map((m: any) => `${m.sender_name}: ${m.kind === 'text' ? m.body : `[${m.kind}] ${m.body || ''}`}`).join('\n') || '(none)'}\n\n${msg.sender_name} (${roleWord(asker)}) asks you: ${strip(msg.body) || '(just your name)'}`,
        }];
      // Who already sees rupee figures in Ask Bunny: the owner, operations and the incharges.
      const seesMoney = direct && (asker.role === 'cluster_head' || asker.role === 'manager');
      const production = ['production_incharge', 'production_ops'].includes(asker.designation);
      const storeId = room.key.startsWith('store:') ? room.key.slice('store:'.length) : direct && !isLead(asker) && !production ? (asker.storeId || null) : null;
      try {
        body = messages.length
          ? await deps.bunny!({ userId: asker.authUserId, role: asker.role, storeId, noMoney: !seesMoney, where: direct ? `a one-to-one chat with ${asker.name || 'a team member'} (${roleWord(asker)})` : `the "${room.name}" group chat`, messages })
          : 'Ask me something about sales, stock, production or the forecast.';
      } catch (e) {
        body = `Sorry, I couldn't answer just now: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
      }
    }
    const { error } = await deps.db.from('chat_messages').insert({ room_id: room.id, sender_id: BUNNY_ID, kind: 'text', body: body.slice(0, 2000), mentions: direct ? [] : [msg.sender_id] });
    if (error) throw new Error(error.message);
  }

  // Called by the chat_message_notify trigger after each message.
  app.post(`${P}/chat/notify`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const { id } = await c.req.json().catch(() => ({}));
      const { data: msg } = await deps.db.from('chat_messages').select('id,room_id,sender_id,sender_name,kind,body,created_at,mentions').eq('id', id).single();
      if (!msg) return c.json({ error: 'No such message' }, 404);
      const [{ data: room }, { data: members }] = await Promise.all([
        deps.db.from('chat_rooms').select('id,key,kind,name').eq('id', msg.room_id).single(),
        deps.db.from('chat_members').select('user_id,last_read_at').eq('room_id', msg.room_id),
      ]);
      if (!room) return c.json({ error: 'No such room' }, 404);
      const what = msg.kind === 'photo' ? `📷 Photo${msg.body ? `: ${msg.body}` : ''}` : msg.kind === 'voice' ? '🎤 Voice note' : msg.body;
      const direct = room.kind === 'direct';
      const title = direct ? msg.sender_name || 'New message' : `${msg.sender_name || 'Someone'} · ${room.name}`;
      // Someone named with @ (or @Everyone) gets their own notification that buzzes, never folded
      // into the group's bundle (owner, 1 Nov 2026: "can we mention someone in chat?").
      const mentioned = new Set<string>(Array.isArray(msg.mentions) ? msg.mentions : []);
      // Bunny answers in its own chat, and in a group when named, after this reply.
      if (deps.bunny && msg.sender_id !== BUNNY_ID && (room.key === `bunny:${msg.sender_id}` || (mentioned.has(BUNNY_ID) && /(^|\s)@Bunny(?![\p{L}\p{N}])/iu.test(msg.body || '')))) {
        inBackground('Bunny chat reply', () => replyAsBunny(msg, room));
      }
      let sent = 0;
      for (const m of members || []) {
        if (m.user_id === msg.sender_id || m.user_id === BUNNY_ID) continue;
        if (m.last_read_at && Date.now() - Date.parse(m.last_read_at) < READING_MS) continue; // reading it now
        const mention = !direct && mentioned.has(m.user_id);
        await deps.notifyUser(
          m.user_id,
          mention ? 'chat_mention' : direct ? 'chat_direct' : 'chat_group',
          mention ? `${msg.sender_name || 'Someone'} mentioned you · ${room.name}` : title,
          String(what).slice(0, 160),
          room.id,
        ).catch(() => undefined);
        sent++;
      }
      return c.json({ success: true, sent });
    } catch (error: any) {
      console.error('Chat notify failed:', error);
      return c.json({ error: error.message }, 500);
    }
  });
}

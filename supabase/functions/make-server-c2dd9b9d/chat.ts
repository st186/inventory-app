// Team chat (owner, 1 Nov 2026: "Can we have chat included in this app" -> groups + direct). The
// phones read and send messages straight to the chat tables under row level security and get new
// ones over Supabase Realtime (migration 20261101020000_team_chat.sql); the server only:
//   POST /chat/sync     keeps the groups in step with the staff list (at most every 10 minutes)
//   POST /chat/direct   opens (or finds) a one-to-one room with someone
//   GET  /chat/people   who you can message
//   POST /chat/notify   called by the database after each message: phone notifications
// Groups: the whole team; each store (its staff); each production house (its staff). The owner and
// operations managers are in every group. A one-to-one room has only its two people - nobody else
// can read it.
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
};
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
const active = (u: any) => !!u?.authUserId && u.status !== 'inactive' && u.designation !== 'site_auditor' && u.role !== 'audit';
const placesOf = (u: any) => ({
  stores: new Set([u.storeId, ...(u.assignedStoreIds || [])].filter(Boolean).map(String)),
  houses: new Set([u.productionHouseId, ...(u.assignedProductionHouseIds || [])].filter(Boolean).map(String)),
});
export const roleWord = (u: any) => (u?.role === 'cluster_head' ? 'Owner' : isLead(u) ? 'Operations' : DESIGNATION_WORD[u?.designation] || 'Team');

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
    const { error: roomErr } = await deps.db.from('chat_rooms').upsert(groups.map((g) => ({ key: g.key, kind: g.key === 'team' ? 'team' : 'place', name: g.name })), { onConflict: 'key' });
    if (roomErr) throw new Error(roomErr.message);
    const { data: rooms, error: readErr } = await deps.db.from('chat_rooms').select('id,key').in('key', groups.map((g) => g.key));
    if (readErr) throw new Error(readErr.message);
    const idOf = new Map((rooms || []).map((r: any) => [r.key, r.id]));
    for (const g of groups) {
      const roomId = idOf.get(g.key);
      if (!roomId) continue;
      const rows = g.members.map((u: any) => ({ room_id: roomId, user_id: u.authUserId, name: String(u.name || 'Someone').slice(0, 60) }));
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

  // Called by the chat_message_notify trigger after each message.
  app.post(`${P}/chat/notify`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const { id } = await c.req.json().catch(() => ({}));
      const { data: msg } = await deps.db.from('chat_messages').select('id,room_id,sender_id,sender_name,kind,body,created_at,mentions').eq('id', id).single();
      if (!msg) return c.json({ error: 'No such message' }, 404);
      const [{ data: room }, { data: members }] = await Promise.all([
        deps.db.from('chat_rooms').select('id,kind,name').eq('id', msg.room_id).single(),
        deps.db.from('chat_members').select('user_id,last_read_at').eq('room_id', msg.room_id),
      ]);
      if (!room) return c.json({ error: 'No such room' }, 404);
      const what = msg.kind === 'photo' ? `📷 Photo${msg.body ? `: ${msg.body}` : ''}` : msg.kind === 'voice' ? '🎤 Voice note' : msg.body;
      const direct = room.kind === 'direct';
      const title = direct ? msg.sender_name || 'New message' : `${msg.sender_name || 'Someone'} · ${room.name}`;
      // Someone named with @ (or @Everyone) gets their own notification that buzzes, never folded
      // into the group's bundle (owner, 1 Nov 2026: "can we mention someone in chat?").
      const mentioned = new Set<string>(Array.isArray(msg.mentions) ? msg.mentions : []);
      let sent = 0;
      for (const m of members || []) {
        if (m.user_id === msg.sender_id) continue;
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

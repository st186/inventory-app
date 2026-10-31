// Team chat on the phone (owner, 1 Nov 2026: groups + direct). Messages are read and sent straight
// to the chat tables with this login's session - row level security decides what it may see - and
// new ones arrive over Supabase Realtime, so reading the chat costs no server calls
// (migration 20261101020000_team_chat.sql; the server's part is chat.ts).
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../utils/supabase/client';
import { chatArchivedMedia } from '../../utils/api';

export type ChatRoom = {
  id: string; key: string; kind: 'team' | 'place' | 'direct'; name: string;
  last_body: string | null; last_kind: string | null; last_sender: string | null; last_at: string | null;
  unread: number; members: number;
};
export type ChatMessage = {
  id: string; room_id: string; sender_id: string; sender_name: string;
  kind: 'text' | 'photo' | 'voice'; body: string; media_path: string | null; media_seconds: number | null; created_at: string;
  /** Moved to Google Drive after 30 days (chat.ts /cron/chat-archive): opened through the server. */
  media_archived_at?: string | null;
  /** Who was named with @ (mentions.ts). */
  mentions?: string[];
};

const db = () => getSupabaseClient();
const BUCKET = 'chat-media';
export const PAGE = 40;

export async function myRooms(): Promise<ChatRoom[]> {
  const { data, error } = await db().rpc('chat_my_rooms');
  if (error) throw new Error(error.message);
  return (data || []) as ChatRoom[];
}

export async function unreadTotal(): Promise<number> {
  const { data, error } = await db().rpc('chat_unread_total');
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function markRead(roomId: string): Promise<void> {
  await db().rpc('chat_mark_read', { r: roomId });
}

/** The newest PAGE messages before `before` (or the newest of all), oldest first. */
export async function messages(roomId: string, before?: string): Promise<ChatMessage[]> {
  let q = db().from('chat_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data || []) as ChatMessage[]).reverse();
}

export async function myUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user?.id || null;
}

/** The people in a room, for @mentions. */
export async function members(roomId: string): Promise<{ user_id: string; name: string }[]> {
  const { data, error } = await db().from('chat_members').select('user_id,name').eq('room_id', roomId).order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function sendText(roomId: string, body: string, mentions: string[] = []): Promise<ChatMessage> {
  const { data, error } = await db().from('chat_messages').insert({ room_id: roomId, kind: 'text', body: body.trim().slice(0, 2000), mentions }).select().single();
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}

/** A photo (data URL from the camera, already made small) or a voice note, then its message. */
export async function sendMedia(roomId: string, kind: 'photo' | 'voice', file: Blob, extras: { body?: string; seconds?: number; mentions?: string[] } = {}): Promise<ChatMessage> {
  const ext = kind === 'photo' ? 'jpg' : file.type.includes('mp4') || file.type.includes('aac') ? 'm4a' : file.type.includes('ogg') ? 'ogg' : 'webm';
  const path = `${roomId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await db().storage.from(BUCKET).upload(path, file, { contentType: file.type || (kind === 'photo' ? 'image/jpeg' : 'audio/webm'), upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await db().from('chat_messages').insert({
    room_id: roomId, kind, media_path: path, body: (extras.body || '').trim().slice(0, 2000), media_seconds: extras.seconds ? Math.round(extras.seconds) : null, mentions: extras.mentions || [],
  }).select().single();
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// Signed links last an hour; kept so a scrolled-back photo isn't asked for again. A photo or voice
// note older than 30 days lives in Google Drive and comes through the server instead.
const links = new Map<string, { url: string; until: number }>();
export async function mediaUrl(m: Pick<ChatMessage, 'id' | 'media_path' | 'media_archived_at'>): Promise<string | null> {
  const cacheKey = m.media_archived_at ? `drive:${m.id}` : m.media_path || '';
  const hit = links.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.url;
  let url: string | null = null;
  if (m.media_archived_at) {
    url = await chatArchivedMedia(m.id).then((r) => r.dataUrl).catch(() => null);
  } else if (m.media_path) {
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(m.media_path, 3600);
    url = error ? null : data?.signedUrl || null;
  }
  if (url) links.set(cacheKey, { url, until: Date.now() + 50 * 60 * 1000 });
  return url;
}

/** New messages in any of my rooms, as they arrive (Realtime keeps to the read policy). */
export function useNewMessages(onMessage: (m: ChatMessage) => void, enabled = true) {
  const latest = useRef(onMessage);
  latest.current = onMessage;
  useEffect(() => {
    if (!enabled) return;
    let channel: RealtimeChannel | null = db()
      .channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => latest.current(payload.new as ChatMessage))
      .subscribe();
    return () => { if (channel) { void db().removeChannel(channel); channel = null; } };
  }, [enabled]);
}

/** The unread count for the top bar's chat button: once on open, then with each new message. */
export function useChatUnread(enabled: boolean, openRoomId: string | null) {
  const [count, setCount] = useState(0);
  const me = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    myUserId().then((id) => { me.current = id; });
    const load = () => unreadTotal().then(setCount).catch(() => undefined);
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('bunny:chat-read', load);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('bunny:chat-read', load); };
  }, [enabled]);
  useNewMessages((m) => { if (m.sender_id !== me.current && m.room_id !== openRoomId) setCount((n) => n + 1); }, enabled);
  return count;
}

/** Tells the top bar to count again (a room was read). */
export const chatReadChanged = () => window.dispatchEvent(new Event('bunny:chat-read'));

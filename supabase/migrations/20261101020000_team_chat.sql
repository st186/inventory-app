-- Team chat (owner, 1 Nov 2026: "Can we have chat included in this app" -> groups + direct).
-- Real tables (not the KV store) so the app can read and send straight from the phone under row
-- level security, and new messages arrive live over Supabase Realtime - no server call per message
-- read, which keeps the free plan's call count down (bunny-supabase-quota).
--
--   chat_rooms     a group (the whole team, each store, each production house) or a one-to-one
--   chat_members   who is in a room, and when they last read it (unread counts)
--   chat_messages  text, photo or voice note; photos and voice notes in the chat-media bucket
--
-- Rooms and members are kept in step with the staff list by the server (chat.ts, POST /chat/sync);
-- the owner and operations managers are in every group. A one-to-one room has only its two people.
-- After a message is saved, a trigger asks the server to send the phone notifications.

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                 -- 'team', 'store:<id>', 'production:<id>', 'direct:<uid>:<uid>'
  kind text not null check (kind in ('team', 'place', 'direct')),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null default '',
  last_read_at timestamptz not null default '2026-01-01T00:00:00Z',
  primary key (room_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null default auth.uid(),
  sender_name text not null default '',
  kind text not null default 'text' check (kind in ('text', 'photo', 'voice')),
  body text not null default '' check (char_length(body) <= 2000),
  media_path text,
  media_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, created_at desc);

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;

-- In the room? (security definer: chat_members' own policy would otherwise ask itself.)
create or replace function public.chat_is_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members where room_id = r and user_id = auth.uid())
$$;

drop policy if exists chat_rooms_read on public.chat_rooms;
create policy chat_rooms_read on public.chat_rooms for select to authenticated using (public.chat_is_member(id));

drop policy if exists chat_members_read on public.chat_members;
create policy chat_members_read on public.chat_members for select to authenticated using (public.chat_is_member(room_id));
drop policy if exists chat_members_mark_read on public.chat_members;
create policy chat_members_mark_read on public.chat_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chat_messages_read on public.chat_messages;
create policy chat_messages_read on public.chat_messages for select to authenticated using (public.chat_is_member(room_id));
drop policy if exists chat_messages_send on public.chat_messages;
create policy chat_messages_send on public.chat_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_is_member(room_id));

-- The sender's name and the time come from the server side, not the phone.
create or replace function public.chat_message_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_id := auth.uid();
  new.sender_name := coalesce((select name from public.chat_members where room_id = new.room_id and user_id = auth.uid()), '');
  new.created_at := now();
  return new;
end $$;
drop trigger if exists chat_message_stamp on public.chat_messages;
create trigger chat_message_stamp before insert on public.chat_messages for each row execute function public.chat_message_stamp();

-- The phone notifications: the server (POST /chat/notify) tells everyone else in the room who isn't
-- reading it right now.
create or replace function public.chat_message_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/chat/notify',
    headers := jsonb_build_object('X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret' limit 1), 'Content-Type', 'application/json'),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 15000
  );
  return new;
end $$;
drop trigger if exists chat_message_notify on public.chat_messages;
create trigger chat_message_notify after insert on public.chat_messages for each row execute function public.chat_message_notify();

-- My rooms, newest first, with the last message and how many I haven't read. A one-to-one room is
-- named after the other person.
create or replace function public.chat_my_rooms()
returns table (id uuid, key text, kind text, name text, last_body text, last_kind text, last_sender text, last_at timestamptz, unread integer, members integer)
language sql stable security invoker set search_path = public as $$
  select r.id, r.key, r.kind,
    case when r.kind = 'direct' then coalesce((select x.name from public.chat_members x where x.room_id = r.id and x.user_id <> auth.uid() limit 1), 'Chat') else r.name end,
    lm.body, lm.kind, lm.sender_name, lm.created_at,
    (select count(*) from public.chat_messages m where m.room_id = r.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid())::integer,
    (select count(*) from public.chat_members x where x.room_id = r.id)::integer
  from public.chat_members me
  join public.chat_rooms r on r.id = me.room_id
  left join lateral (select m.body, m.kind, m.sender_name, m.created_at from public.chat_messages m where m.room_id = r.id order by m.created_at desc limit 1) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc
$$;

create or replace function public.chat_unread_total() returns integer
language sql stable security invoker set search_path = public as $$
  select coalesce(sum((select count(*) from public.chat_messages m where m.room_id = me.room_id and m.created_at > me.last_read_at and m.sender_id <> auth.uid())), 0)::integer
  from public.chat_members me where me.user_id = auth.uid()
$$;

create or replace function public.chat_mark_read(r uuid) returns void
language sql security invoker set search_path = public as $$
  update public.chat_members set last_read_at = now() where room_id = r and user_id = auth.uid()
$$;

grant execute on function public.chat_my_rooms(), public.chat_unread_total(), public.chat_mark_read(uuid), public.chat_is_member(uuid) to authenticated;

-- Live: new messages reach the open app (Realtime keeps to the read policy above).
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;

-- Photos and voice notes: chat-media/<room id>/<file>, only for the room's members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'])
on conflict (id) do nothing;

drop policy if exists chat_media_read on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.chat_is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists chat_media_upload on storage.objects;
create policy chat_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and public.chat_is_member(((storage.foldername(name))[1])::uuid));

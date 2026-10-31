-- Bunny in team chat (owner, 1 Nov 2026: "will bunny be available in chat" -> yes). Bunny is a
-- member of every group and has a one-to-one chat with everyone, under a fixed id that is no one's
-- sign-in (chat.ts BUNNY_ID). Its replies are written by the server (service role), which has no
-- auth.uid(): the stamp keeps the sender the server gave only then - a phone still always sends as
-- itself. Group member counts leave Bunny out.

create or replace function public.chat_message_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sender_id := coalesce(auth.uid(), new.sender_id);
  new.sender_name := coalesce((select name from public.chat_members where room_id = new.room_id and user_id = new.sender_id), '');
  new.created_at := now();
  return new;
end $$;

create or replace function public.chat_my_rooms()
returns table (id uuid, key text, kind text, name text, last_body text, last_kind text, last_sender text, last_at timestamptz, unread integer, members integer)
language sql stable security invoker set search_path = public as $$
  select r.id, r.key, r.kind,
    case when r.kind = 'direct' then coalesce((select x.name from public.chat_members x where x.room_id = r.id and x.user_id <> auth.uid() limit 1), 'Chat') else r.name end,
    lm.body, lm.kind, lm.sender_name, lm.created_at,
    (select count(*) from public.chat_messages m where m.room_id = r.id and m.created_at > me.last_read_at and m.sender_id <> auth.uid())::integer,
    (select count(*) from public.chat_members x where x.room_id = r.id and x.user_id <> '00000000-0000-4000-8000-00000000b0b0')::integer
  from public.chat_members me
  join public.chat_rooms r on r.id = me.room_id
  left join lateral (select m.body, m.kind, m.sender_name, m.created_at from public.chat_messages m where m.room_id = r.id order by m.created_at desc limit 1) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc
$$;

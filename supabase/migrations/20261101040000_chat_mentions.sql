-- @mentions in team chat (owner, 1 Nov 2026: "can we mention someone in chat?"). The phone puts the
-- people named with @ (or everyone, for @Everyone) on the message; the server's notify gives each
-- of them their own notification (chat_mention), even in a busy group whose other messages are
-- bundled (chat.ts).
alter table public.chat_messages add column if not exists mentions uuid[] not null default '{}';

-- Chat photos and voice notes move to Google Drive after 30 days (owner, 1 Nov 2026: "these chats
-- and images and videos stored in supabase or drive either supabase will overflow"). chat.ts
-- POST /cron/chat-archive copies each one older than 30 days to Drive ("Chat/<month>/<room>"),
-- notes the Drive file here and removes it from the chat-media bucket; the chat still opens it
-- (GET /chat/media/:id). Text stays in the table: it is tiny. Nightly at 4 AM IST (22:30 UTC), with
-- job 35's command (headers and keys) and its own route.

alter table public.chat_messages add column if not exists media_drive_id text;
alter table public.chat_messages add column if not exists media_archived_at timestamptz;

select cron.schedule(
  'chat-archive',
  '30 22 * * *',
  replace((select command from cron.job where jobname = 'stock-count-reminders'), 'send-stock-count-reminders''', 'cron/chat-archive''')
);

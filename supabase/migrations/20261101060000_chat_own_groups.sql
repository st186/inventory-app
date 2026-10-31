-- Groups people make themselves (owner, 1 Nov 2026: "How to form new groups choose people remove
-- people remove group edit group name"). A made group is kind 'custom' (key group:<uuid>), with who
-- made it; the person who made it, the owner and operations may rename it, add and take out people,
-- and delete it (server chat.ts - phones never write rooms or members themselves). The automatic
-- groups keep following the staff list; the owner and operations may rename them, and `renamed`
-- stops the staff-list sync putting the old name back.
alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms add constraint chat_rooms_kind_check check (kind in ('team', 'place', 'direct', 'custom'));
alter table public.chat_rooms add column if not exists created_by uuid;
alter table public.chat_rooms add column if not exists renamed boolean not null default false;

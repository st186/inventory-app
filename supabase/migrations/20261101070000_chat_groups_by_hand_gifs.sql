-- Owner, 1 Nov 2026: "Provide delete option remove people option from existing group". An automatic
-- group (the whole team, a store, a production house) whose people the owner or operations change
-- becomes `manual`: the staff-list sync stops adding and taking out people there (chat.ts).
alter table public.chat_rooms add column if not exists manual boolean not null default false;

-- Owner, 1 Nov 2026: "where is emoji gif option". A GIF from the phone's gallery is sent as it is
-- (still moving), so the chat-media bucket takes GIFs too.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
where id = 'chat-media' and not ('image/gif' = any (allowed_mime_types));

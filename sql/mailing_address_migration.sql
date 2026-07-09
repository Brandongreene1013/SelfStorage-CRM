-- Mailing address for contacts (Database / Call Mode) and clients (Clients / Pipeline).
-- Run once in the Supabase SQL editor. The app degrades gracefully until this runs
-- (mailing addresses just won't persist), same pattern as prior column migrations.

alter table contacts add column if not exists mailing_address text not null default '';
alter table clients  add column if not exists mailing_address text not null default '';

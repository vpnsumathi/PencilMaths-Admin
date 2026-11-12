-- Remembers the Google Drive folders the app has made, so it does not have to search Drive by name every time.
-- Each row is one folder: key = "<parent folder id>/<folder name>", folder_id = Drive's id for it.
-- Only the server (secret key) reads and writes this table: no one signed in to the app can see it.
-- Safe to empty at any time: the app then finds each folder by name once more and saves it again.
-- Run after 20261103000002_created_modified_dates.sql. Run on Staging first; on Production at go-live.

create table if not exists drive_folders (
  key text primary key,
  folder_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists drive_folders_folder_id on drive_folders (folder_id);

alter table drive_folders enable row level security;   -- no policies: signed-in users get nothing
revoke all on drive_folders from anon, authenticated;

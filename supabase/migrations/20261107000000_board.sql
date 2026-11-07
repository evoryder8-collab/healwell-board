-- Healwell posts board: tables, link-token access, collaborator directory, realtime.
--
-- Access model: the board sends its private link token in the `x-board-token`
-- header. Row level security compares its SHA-256 with private.board_token_hash().
-- Without the token, the anon role can read and write nothing.
-- The agent uses the service key, which bypasses RLS.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, service_role;

-- Replaced by the SQL that `npm run link` prints. Until then nothing is readable.
create or replace function private.board_token_hash() returns text
language sql immutable set search_path = '' as $$ select null::text $$;
revoke all on function private.board_token_hash() from public, anon, authenticated;

create or replace function private.has_board_token() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    encode(sha256(convert_to(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-board-token', 'utf8')), 'hex')
    = private.board_token_hash(),
    false)
$$;
revoke all on function private.has_board_token() from public;
grant execute on function private.has_board_token() to anon;

-- "@Some Handle " -> "@somehandle". Instagram handles: a-z 0-9 . _ , max 30.
create or replace function private.normalize_handle(h text) returns text
language sql immutable set search_path = '' as $$
  select nullif('@' || left(regexp_replace(lower(coalesce(h, '')), '[^a-z0-9._]', '', 'g'), 30), '@')
$$;

create or replace function private.normalize_handles(hs text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(h order by first_pos), '{}')
  from (
    select h, min(pos) as first_pos
    from unnest(coalesce(hs, '{}')) with ordinality as u(raw, pos),
         lateral (select private.normalize_handle(raw) as h) n
    where h is not null
    group by h
  ) d
$$;

-- Tables ---------------------------------------------------------------------

create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  external_id   text not null unique,
  platform      text not null default 'instagram',
  type          text not null check (type in ('reel', 'carousel', 'image', 'story')),
  scheduled_at  timestamptz not null,
  published     boolean not null default false,
  media_url     text,
  caption       text not null default '' check (char_length(caption) <= 2200),
  collaborators text[] not null default '{}',
  updated_at    timestamptz not null default now()
);
create index posts_scheduled_at_idx on public.posts (scheduled_at);

create table public.collaborators (
  handle     text primary key check (handle = private.normalize_handle(handle)),
  name       text not null default '' check (char_length(name) <= 80),
  updated_at timestamptz not null default now()
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author     text not null check (char_length(btrim(author)) between 1 and 60),
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index comments_post_id_idx on public.comments (post_id, created_at);

-- Triggers -------------------------------------------------------------------

-- Normalize handles, stamp updated_at, and keep board-owned fields away from
-- the agent: updates made with the service key cannot change caption or
-- collaborators once a post exists.
create or replace function private.posts_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if current_user = 'service_role' then
      new.caption := old.caption;
      new.collaborators := old.collaborators;
    end if;
    new.updated_at := now();
  end if;
  new.collaborators := private.normalize_handles(new.collaborators);
  return new;
end $$;

create trigger posts_before_write before insert or update on public.posts
for each row execute function private.posts_before_write();

-- Adding a handle to a card adds it to the directory.
create or replace function private.posts_fill_directory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.collaborators (handle)
  select unnest(new.collaborators)
  on conflict (handle) do nothing;
  return null;
end $$;

create trigger posts_fill_directory after insert or update of collaborators on public.posts
for each row execute function private.posts_fill_directory();

create or replace function private.collaborators_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if current_user = 'service_role' then
      new.name := old.name;
    end if;
    new.updated_at := now();
  end if;
  new.name := btrim(new.name);
  return new;
end $$;

create trigger collaborators_before_write before insert or update on public.collaborators
for each row execute function private.collaborators_before_write();

-- Realtime: every change is broadcast on a topic derived from the token hash,
-- so only holders of the link can know which channel to join.
create or replace function private.broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  hash text := private.board_token_hash();
begin
  if hash is null then return null; end if;
  begin
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'op', tg_op,
        'row', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end),
      'change', 'board:' || hash, false);
  exception when others then
    null; -- a realtime hiccup must never block a write
  end;
  return null;
end $$;

create trigger posts_broadcast after insert or update or delete on public.posts
for each row execute function private.broadcast_change();
create trigger collaborators_broadcast after insert or update or delete on public.collaborators
for each row execute function private.broadcast_change();
create trigger comments_broadcast after insert or update or delete on public.comments
for each row execute function private.broadcast_change();

-- Read models ----------------------------------------------------------------

-- Posts per Zurich calendar day: drives the year view and the minimap
-- without loading every row.
create view public.post_days with (security_invoker = true) as
  select (scheduled_at at time zone 'Europe/Zurich')::date as day,
         count(*)::int as posts,
         count(*) filter (where not published)::int as scheduled
  from public.posts
  group by 1;

-- The directory: every handle ever added, its name, how many posts it is on.
create view public.collaborator_stats with (security_invoker = true) as
  select c.handle, c.name, coalesce(s.posts, 0)::int as posts, s.latest_at
  from public.collaborators c
  left join (
    select h as handle, count(*) as posts, max(p.scheduled_at) as latest_at
    from public.posts p, unnest(p.collaborators) as h
    group by h
  ) s using (handle);

create or replace function public.board_ok() returns boolean
language sql stable set search_path = '' as $$ select private.has_board_token() $$;

-- Privileges and row level security -------------------------------------------

alter table public.posts enable row level security;
alter table public.collaborators enable row level security;
alter table public.comments enable row level security;

revoke all on public.posts, public.collaborators, public.comments,
              public.post_days, public.collaborator_stats from anon, authenticated;
revoke all on function public.board_ok() from public, authenticated;

grant select on public.posts, public.collaborators, public.comments,
                public.post_days, public.collaborator_stats to anon;
grant update (caption, collaborators) on public.posts to anon;
grant update (name) on public.collaborators to anon;
grant insert (post_id, author, body) on public.comments to anon;
grant execute on function public.board_ok() to anon;

create policy "link holders read posts" on public.posts
  for select to anon using ((select private.has_board_token()));
create policy "link holders edit posts" on public.posts
  for update to anon using ((select private.has_board_token())) with check ((select private.has_board_token()));

create policy "link holders read collaborators" on public.collaborators
  for select to anon using ((select private.has_board_token()));
create policy "link holders name collaborators" on public.collaborators
  for update to anon using ((select private.has_board_token())) with check ((select private.has_board_token()));

create policy "link holders read comments" on public.comments
  for select to anon using ((select private.has_board_token()));
create policy "link holders write comments" on public.comments
  for insert to anon with check ((select private.has_board_token()));

-- Storage: public bucket for small WebP thumbnails. Object names are random
-- UUIDs, so a thumbnail can only be found by reading its post first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbs', 'thumbs', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

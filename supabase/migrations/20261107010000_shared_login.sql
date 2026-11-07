-- Shared sign-in: one username and password for everyone on the board.
-- Signing in returns the board token, so the private link keeps working and
-- row level security stays exactly as before. Credentials and the token live
-- in one private row; nothing here is readable through the API.

create extension if not exists pgcrypto with schema extensions;

create table private.access (
  id            boolean primary key default true check (id),
  token         text not null,
  username      text,
  password_hash text,
  failed        int not null default 0,
  failed_since  timestamptz
);
revoke all on private.access from public, anon, authenticated, service_role;

-- The token hash now comes from the stored token.
create or replace function private.board_token_hash() returns text
language sql stable set search_path = '' as $$
  select encode(sha256(convert_to(token, 'utf8')), 'hex') from private.access
$$;
revoke all on function private.board_token_hash() from public, anon, authenticated;

-- Returns the board token for the right username and password, else null.
-- Attempts are serialized; ten misses within 15 minutes lock sign-in for the rest of that window.
create or replace function public.board_login(username text, password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  a private.access;
  window_start timestamptz := now() - interval '15 minutes';
begin
  select * into a from private.access where id for update;
  if not found or a.username is null or a.password_hash is null then return null; end if;
  if a.failed >= 10 and a.failed_since > window_start then
    raise exception 'too many attempts' using errcode = 'P0001', hint = 'locked';
  end if;
  if lower(btrim(username)) = a.username and extensions.crypt(password, a.password_hash) = a.password_hash then
    update private.access set failed = 0, failed_since = null where id;
    return a.token;
  end if;
  update private.access set
    failed = case when failed_since is null or failed_since <= window_start then 1 else failed + 1 end,
    failed_since = case when failed_since is null or failed_since <= window_start then now() else failed_since end
  where id;
  perform pg_sleep(0.4);
  return null;
end $$;
revoke all on function public.board_login(text, text) from public, authenticated;
grant execute on function public.board_login(text, text) to anon;

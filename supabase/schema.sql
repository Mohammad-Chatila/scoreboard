-- ═══════════════════════════════════════════════════════════
--  scoreboard — paste this whole file into the Supabase
--  SQL Editor and hit Run. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── tables ────────────────────────────────────────────────

create table if not exists public.friends (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 24),
  emoji      text not null default '🌸',
  color      text not null default '#ff4d8d',
  created_at timestamptz not null default now()
);

create unique index if not exists friends_name_lower_idx
  on public.friends (lower(name));

-- passwords live here; RLS is on with NO policies, so the public
-- anon key can never read this table. only the definer functions below.
create table if not exists public.friend_auth (
  friend_id uuid primary key references public.friends(id) on delete cascade,
  password  text not null
);

create table if not exists public.points (
  id         bigint generated always as identity primary key,
  friend_id  uuid not null references public.friends(id) on delete cascade,
  given_by   uuid references public.friends(id) on delete set null,
  delta      int  not null check (delta <> 0 and abs(delta) <= 1000),
  comment    text not null default '' check (char_length(comment) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists points_friend_idx  on public.points (friend_id);
create index if not exists points_created_idx on public.points (created_at desc);

-- ── standings view ────────────────────────────────────────

create or replace view public.standings as
  select f.id, f.name, f.emoji, f.color,
         coalesce(sum(p.delta), 0)::int as score,
         count(p.id)::int               as entries,
         max(p.created_at)              as last_at
  from public.friends f
  left join public.points p on p.friend_id = f.id
  group by f.id, f.name, f.emoji, f.color;

-- ── row level security ────────────────────────────────────

alter table public.friends     enable row level security;
alter table public.friend_auth enable row level security;
alter table public.points      enable row level security;

drop policy if exists "read friends" on public.friends;
create policy "read friends" on public.friends for select using (true);

drop policy if exists "read points" on public.points;
create policy "read points" on public.points for select using (true);

-- friend_auth intentionally has zero policies => locked shut.
-- no insert/update/delete policies anywhere => all writes go via rpc.

grant select on public.standings to anon, authenticated;

-- ── rpc ───────────────────────────────────────────────────

create or replace function public.signup(
  p_name text, p_password text, p_emoji text default '🌸', p_color text default '#ff4d8d'
) returns public.friends
language plpgsql security definer set search_path = public as $$
declare v public.friends;
begin
  p_name := btrim(p_name);
  if char_length(p_name) < 1 or char_length(p_name) > 24 then
    raise exception 'Name must be 1-24 characters';
  end if;
  if char_length(coalesce(p_password, '')) < 4 then
    raise exception 'Password must be at least 4 characters';
  end if;
  if exists (select 1 from friends where lower(name) = lower(p_name)) then
    raise exception 'That name is already taken';
  end if;

  insert into friends (name, emoji, color)
  values (p_name,
          coalesce(nullif(btrim(p_emoji), ''), '🌸'),
          coalesce(nullif(btrim(p_color), ''), '#ff4d8d'))
  returning * into v;

  insert into friend_auth (friend_id, password) values (v.id, p_password);
  return v;
end $$;

create or replace function public.login(p_name text, p_password text)
returns public.friends
language plpgsql security definer set search_path = public as $$
declare v public.friends;
begin
  select f.* into v
  from friends f join friend_auth a on a.friend_id = f.id
  where lower(f.name) = lower(btrim(p_name)) and a.password = p_password;

  if v.id is null then raise exception 'Wrong name or password'; end if;
  return v;
end $$;

create or replace function public.add_points(
  p_name text, p_password text, p_target uuid, p_delta int, p_comment text default ''
) returns public.points
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v public.points;
begin
  select f.id into v_me
  from friends f join friend_auth a on a.friend_id = f.id
  where lower(f.name) = lower(btrim(p_name)) and a.password = p_password;

  if v_me is null then raise exception 'Wrong name or password'; end if;
  if p_delta = 0 then raise exception 'Points cannot be zero'; end if;
  if abs(p_delta) > 1000 then raise exception 'Keep it under 1000 points'; end if;
  if not exists (select 1 from friends where id = p_target) then
    raise exception 'No such friend';
  end if;

  insert into points (friend_id, given_by, delta, comment)
  values (p_target, v_me, p_delta, left(coalesce(p_comment, ''), 280))
  returning * into v;
  return v;
end $$;

-- you can only take back a point you gave
create or replace function public.delete_point(
  p_name text, p_password text, p_id bigint
) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  select f.id into v_me
  from friends f join friend_auth a on a.friend_id = f.id
  where lower(f.name) = lower(btrim(p_name)) and a.password = p_password;

  if v_me is null then raise exception 'Wrong name or password'; end if;

  delete from points where id = p_id and given_by = v_me;
  if not found then raise exception 'You can only undo points you gave'; end if;
end $$;

create or replace function public.update_profile(
  p_name text, p_password text, p_emoji text, p_color text
) returns public.friends
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v public.friends;
begin
  select f.id into v_me
  from friends f join friend_auth a on a.friend_id = f.id
  where lower(f.name) = lower(btrim(p_name)) and a.password = p_password;

  if v_me is null then raise exception 'Wrong name or password'; end if;

  update friends
     set emoji = coalesce(nullif(btrim(p_emoji), ''), emoji),
         color = coalesce(nullif(btrim(p_color), ''), color)
   where id = v_me
  returning * into v;
  return v;
end $$;

revoke all on function public.signup(text,text,text,text)        from public;
revoke all on function public.login(text,text)                   from public;
revoke all on function public.add_points(text,text,uuid,int,text) from public;
revoke all on function public.delete_point(text,text,bigint)     from public;
revoke all on function public.update_profile(text,text,text,text) from public;

grant execute on function public.signup(text,text,text,text)         to anon, authenticated;
grant execute on function public.login(text,text)                    to anon, authenticated;
grant execute on function public.add_points(text,text,uuid,int,text)  to anon, authenticated;
grant execute on function public.delete_point(text,text,bigint)      to anon, authenticated;
grant execute on function public.update_profile(text,text,text,text)  to anon, authenticated;

-- ── realtime (live updates for everyone on the board) ──────

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.points';
  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.friends';
  exception when duplicate_object then null; end;
end $$;

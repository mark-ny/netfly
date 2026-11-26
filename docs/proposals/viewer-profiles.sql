-- PROPOSAL ONLY. NOT in supabase/migrations and NOT applied anywhere.
-- Viewer profiles ("Who's watching?") for Netfly. Review on a staging project first.
-- Phase 1 is additive: nothing existing is renamed, dropped or re-keyed, and the
-- current app keeps working because user_id columns and policies are untouched.
begin;

create table public.viewer_profiles(
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 40),
  avatar text not null default 'ember' check (avatar ~ '^[a-z0-9-]{1,24}$'),
  is_kids boolean not null default false,
  is_default boolean not null default false,
  max_rank int check (max_rank between 0 and 5),   -- null = no limit; see rank table below
  pin_hash text,                                     -- written by the Worker only (service role)
  created_at timestamptz not null default now()
);
create unique index viewer_one_default on public.viewer_profiles(account_id) where is_default;
create index viewer_account on public.viewer_profiles(account_id);

-- Limit five profiles per account.
create function private.profile_cap() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('vp-'||new.account_id::text));
  if (select count(*) from public.viewer_profiles where account_id=new.account_id)>=5 then
    raise exception 'Profile limit reached';
  end if;
  return new;
end $$;
create trigger profile_cap before insert on public.viewer_profiles
  for each row execute function private.profile_cap();

alter table public.viewer_profiles enable row level security;
revoke all on public.viewer_profiles from anon, authenticated;
grant all on public.viewer_profiles to service_role;
-- The browser may read its own profiles and change only presentation fields.
-- It can never read or write pin_hash, max_rank or is_kids (those go through the Worker).
grant select (id,account_id,name,avatar,is_kids,is_default,max_rank,created_at) on public.viewer_profiles to authenticated;
grant insert (account_id,name,avatar) on public.viewer_profiles to authenticated;
grant update (name,avatar) on public.viewer_profiles to authenticated;
grant delete on public.viewer_profiles to authenticated;
create policy own_profiles_read on public.viewer_profiles for select to authenticated
  using (account_id=(select auth.uid()));
create policy own_profiles_insert on public.viewer_profiles for insert to authenticated
  with check (account_id=(select auth.uid()) and is_default=false and is_kids=false);
create policy own_profiles_update on public.viewer_profiles for update to authenticated
  using (account_id=(select auth.uid())) with check (account_id=(select auth.uid()));
create policy own_profiles_delete on public.viewer_profiles for delete to authenticated
  using (account_id=(select auth.uid()) and is_default=false);

-- Backfill: one default profile per existing account, named from the current display name.
insert into public.viewer_profiles(account_id,name,is_default)
select p.user_id, coalesce(nullif(p.display_name,''),'Me'), true from public.profiles p
on conflict do nothing;

-- Additive link columns. Existing rows are attached to the default profile.
alter table public.watchlists     add column profile_id uuid references public.viewer_profiles on delete cascade;
alter table public.watch_progress add column profile_id uuid references public.viewer_profiles on delete cascade;
alter table public.ratings        add column profile_id uuid references public.viewer_profiles on delete cascade;
update public.watchlists w     set profile_id=(select id from public.viewer_profiles v where v.account_id=w.user_id and v.is_default);
update public.watch_progress w set profile_id=(select id from public.viewer_profiles v where v.account_id=w.user_id and v.is_default);
update public.ratings w        set profile_id=(select id from public.viewer_profiles v where v.account_id=w.user_id and v.is_default);

-- Phase 1 policy addition: when profile_id is set it must belong to the caller.
-- (RLS policies are OR-ed, so existing own_rows policies stay as-is; add a guard via a check trigger.)
create function private.profile_owner_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.profile_id is not null and not exists(
    select 1 from public.viewer_profiles v where v.id=new.profile_id and v.account_id=new.user_id) then
    raise exception 'Profile does not belong to this account';
  end if;
  return new;
end $$;
create trigger guard_wl before insert or update on public.watchlists     for each row execute function private.profile_owner_guard();
create trigger guard_wp before insert or update on public.watch_progress for each row execute function private.profile_owner_guard();
create trigger guard_rt before insert or update on public.ratings        for each row execute function private.profile_owner_guard();
revoke all on function private.profile_cap(), private.profile_owner_guard() from public;

commit;

-- ---------------------------------------------------------------------------
-- Phase 2 (separate release, after the app writes profile_id everywhere):
--   * make profile_id NOT NULL and change primary keys to (profile_id, movie_id)
--   * replace own_rows policies with profile-ownership policies
--   Needs its own review because it re-keys live tables.
-- Maturity ranks (proposal): 0 = all ages/G, 1 = PG, 2 = 13+, 3 = 16+, 4 = 18+, 5 = unrated.
--   movies.classification is free text today, so a controlled list or lookup table is required first.
--   Enforcement point: Worker POST /authorize (reject when movie rank > profile max_rank) plus a
--   catalog function that filters by profile. A frontend-only filter is NOT parental control.
-- PIN: Worker hashes (e.g. PBKDF2/argon2 via WebCrypto-compatible parameters), rate-limits attempts,
--   and issues a short-lived profile-switch proof. The browser never sees pin_hash.
-- ---------------------------------------------------------------------------
-- ROLLBACK (phase 1):
--   begin;
--   drop trigger guard_wl on public.watchlists; drop trigger guard_wp on public.watch_progress; drop trigger guard_rt on public.ratings;
--   alter table public.watchlists drop column profile_id; alter table public.watch_progress drop column profile_id; alter table public.ratings drop column profile_id;
--   drop table public.viewer_profiles; drop function private.profile_owner_guard(); drop function private.profile_cap();
--   commit;

-- NETFLY on Neon: DRAFT schema translated from supabase/migrations/20261125081807_cinema.sql
-- (plus the Netfly brand value). NOT APPLIED and NOT TESTED against Neon (no Postgres is available
-- in the authoring environment). Review, then run on a Neon BRANCH first.
--
-- Differences from the Supabase version, all deliberate:
--   auth.users            -> neon_auth."user"      (Neon Auth, Managed Better Auth)
--   auth.sessions         -> neon_auth.session
--   anon                  -> anonymous             (role name used by the Neon Data API)
--   service_role          -> netfly_service        (role the Cloudflare Worker uses over direct SQL)
--   private.level()       -> no aal2/MFA gate: Neon Auth has no TOTP yet; staff level now comes from public.roles only
--
-- BEFORE RUNNING (see neon/README.md): enable Neon Auth + Data API on the branch and leave
-- "Grant public schema access" UNCHECKED (it grants all tables to `authenticated`; this script
-- grants per table). Run neon/00_discover.sql first and confirm neon_auth."user".id and
-- neon_auth.session.id / user_id are uuid; adjust the column types below if they are text.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anonymous') then create role anonymous nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='netfly_service') then create role netfly_service nologin; end if;
end $$;
grant usage on schema public to anonymous, authenticated, netfly_service;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anonymous,authenticated,netfly_service;
create type public.cinema_role as enum ('viewer','content_manager','administrator','super_administrator');
create table public.profiles(user_id uuid primary key references neon_auth."user" on delete cascade, display_name text not null default '' check(length(display_name)<=80),reduce_data boolean not null default false,created_at timestamptz not null default now());
create table public.roles(user_id uuid primary key references neon_auth."user" on delete cascade,role public.cinema_role not null default 'viewer');
create function private.level() returns int language sql stable security definer set search_path='' as $$
select coalesce((select case role when 'content_manager' then 1 when 'administrator' then 2 when 'super_administrator' then 3 else 0 end from public.roles where user_id=(select auth.uid())),0) $$;
revoke all on function private.level() from public;
grant execute on function private.level() to authenticated,anonymous,netfly_service;
create table public.movies(id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 1 and 180),slug text unique not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),synopsis text not null default '' check(length(synopsis)<=6000),year int not null check(year between 1880 and 2200),duration int not null check(duration between 1 and 28800),language text not null default 'No dialogue',country text not null default '',classification text not null default 'Unrated',director text not null default '',poster text not null check(poster ~ '^(https://|/art/)'),backdrop text not null check(backdrop ~ '^(https://|/art/)'),trailer text not null default '' check(trailer='' or trailer ~ '^(https://|/demo/)'),featured boolean not null default false,state text not null default 'draft' check(state in ('draft','published','archived')),release_at timestamptz not null default now(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index movies_listing on public.movies(state,created_at desc,id);
create table public.genres(id uuid primary key default gen_random_uuid(),name text unique not null check(length(name) between 1 and 80));
create table public.cast_members(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 160));
create table public.collections(id uuid primary key default gen_random_uuid(),name text unique not null,sort_order int not null default 0);
create table public.movie_genres(movie_id uuid references public.movies on delete cascade,genre_id uuid references public.genres on delete restrict,primary key(movie_id,genre_id));
create table public.movie_cast(movie_id uuid references public.movies on delete cascade,cast_id uuid references public.cast_members on delete restrict,primary key(movie_id,cast_id));
create table public.collection_movies(movie_id uuid references public.movies on delete cascade,collection_id uuid references public.collections on delete restrict,sort_order int not null default 0,primary key(movie_id,collection_id));
create table public.video_assets(movie_id uuid primary key references public.movies on delete restrict,prefix uuid unique not null,bytes bigint not null check(bytes>0),qualities int[] not null default '{360,480,720}' check(qualities <@ array[360,480,720,1080] and cardinality(qualities)>0));
create table public.subtitle_tracks(id uuid primary key default gen_random_uuid(),movie_id uuid not null references public.video_assets on delete cascade,label text not null,language text not null,path text not null check(path ~ '^captions/[a-z]{2,3}(-[A-Z]{2})?\.vtt$'),unique(movie_id,language));
create table public.content_licenses(id uuid primary key default gen_random_uuid(),movie_id uuid references public.movies on delete restrict not null,starts_at timestamptz not null,ends_at timestamptz not null,territories text[] not null check(cardinality(territories)>0),reference text not null check(length(reference)>0),check(ends_at>starts_at));
create index licenses_window on public.content_licenses(movie_id,ends_at,starts_at);
create table public.watchlists(user_id uuid references neon_auth."user" on delete cascade,movie_id uuid references public.movies on delete cascade,created_at timestamptz not null default now(),primary key(user_id,movie_id));
create table public.watch_progress(user_id uuid references neon_auth."user" on delete cascade,movie_id uuid references public.movies on delete cascade,position int not null check(position between 0 and 28800),updated_at timestamptz not null default now(),primary key(user_id,movie_id));
create table public.ratings(user_id uuid references neon_auth."user" on delete cascade,movie_id uuid references public.movies on delete cascade,score smallint not null check(score between 1 and 5),primary key(user_id,movie_id));
create table public.playback_sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references neon_auth."user" on delete cascade,movie_id uuid not null references public.movies on delete cascade,auth_session uuid not null,token_hash text unique not null,territory text not null,created_at timestamptz not null default now(),seen_at timestamptz not null default now(),expires_at timestamptz not null,watch_seconds int not null default 0,completed boolean not null default false,failed boolean not null default false);
create index sessions_user_window on public.playback_sessions(user_id,expires_at);
create index sessions_movie_created on public.playback_sessions(movie_id,created_at);
create table public.analytics_daily(day date not null,movie_id uuid not null references public.movies on delete cascade,plays int not null,seconds bigint not null,completions int not null,failures int not null,primary key(day,movie_id));
create table public.user_reports(id uuid primary key default gen_random_uuid(),user_id uuid references neon_auth."user" on delete cascade,movie_id uuid references public.movies on delete set null,contact_email text check(length(contact_email)<=254),kind text not null check(kind in ('playback','support','copyright','privacy')),message text not null check(length(message) between 5 and 3000),status text not null default 'open' check(status in ('open','reviewing','resolved')),created_at timestamptz not null default now());
create table public.site_settings(key text primary key,value jsonb not null);
create table public.admin_audit_logs(id bigint generated always as identity primary key,actor uuid references neon_auth."user" on delete set null,action text not null,entity text not null,record_key text,created_at timestamptz not null default now());
create function private.on_signup() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(user_id) values(new.id);insert into public.roles(user_id) values(new.id);return new;end $$;
create trigger on_auth_user_created after insert on neon_auth."user" for each row execute function private.on_signup();
insert into public.profiles(user_id) select id from neon_auth."user" on conflict do nothing;
insert into public.roles(user_id) select id from neon_auth."user" on conflict do nothing;
create function private.audit() returns trigger language plpgsql security definer set search_path='' as $$ declare obj jsonb; begin obj=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;insert into public.admin_audit_logs(actor,action,entity,record_key) values(auth.uid(),tg_op,tg_table_name,coalesce(obj->>'id',obj->>'movie_id',obj->>'user_id',obj->>'key'));return null;end $$;
create function private.stamp() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
create trigger movie_stamp before update on public.movies for each row execute function private.stamp();
create trigger progress_stamp before insert or update on public.watch_progress for each row execute function private.stamp();
alter table public.movies enable row level security;
revoke all on public.movies from anonymous, authenticated;
grant all on public.movies to netfly_service;
alter table public.genres enable row level security;
revoke all on public.genres from anonymous, authenticated;
grant all on public.genres to netfly_service;
alter table public.movie_genres enable row level security;
revoke all on public.movie_genres from anonymous, authenticated;
grant all on public.movie_genres to netfly_service;
alter table public.cast_members enable row level security;
revoke all on public.cast_members from anonymous, authenticated;
grant all on public.cast_members to netfly_service;
alter table public.movie_cast enable row level security;
revoke all on public.movie_cast from anonymous, authenticated;
grant all on public.movie_cast to netfly_service;
alter table public.video_assets enable row level security;
revoke all on public.video_assets from anonymous, authenticated;
grant all on public.video_assets to netfly_service;
alter table public.subtitle_tracks enable row level security;
revoke all on public.subtitle_tracks from anonymous, authenticated;
grant all on public.subtitle_tracks to netfly_service;
alter table public.content_licenses enable row level security;
revoke all on public.content_licenses from anonymous, authenticated;
grant all on public.content_licenses to netfly_service;
alter table public.collections enable row level security;
revoke all on public.collections from anonymous, authenticated;
grant all on public.collections to netfly_service;
alter table public.collection_movies enable row level security;
revoke all on public.collection_movies from anonymous, authenticated;
grant all on public.collection_movies to netfly_service;
alter table public.profiles enable row level security;
revoke all on public.profiles from anonymous, authenticated;
grant all on public.profiles to netfly_service;
alter table public.roles enable row level security;
revoke all on public.roles from anonymous, authenticated;
grant all on public.roles to netfly_service;
alter table public.watchlists enable row level security;
revoke all on public.watchlists from anonymous, authenticated;
grant all on public.watchlists to netfly_service;
alter table public.watch_progress enable row level security;
revoke all on public.watch_progress from anonymous, authenticated;
grant all on public.watch_progress to netfly_service;
alter table public.ratings enable row level security;
revoke all on public.ratings from anonymous, authenticated;
grant all on public.ratings to netfly_service;
alter table public.playback_sessions enable row level security;
revoke all on public.playback_sessions from anonymous, authenticated;
grant all on public.playback_sessions to netfly_service;
alter table public.analytics_daily enable row level security;
revoke all on public.analytics_daily from anonymous, authenticated;
grant all on public.analytics_daily to netfly_service;
alter table public.user_reports enable row level security;
revoke all on public.user_reports from anonymous, authenticated;
grant all on public.user_reports to netfly_service;
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anonymous, authenticated;
grant all on public.site_settings to netfly_service;
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anonymous, authenticated;
grant all on public.admin_audit_logs to netfly_service;
grant select,insert,update,delete on public.movies to authenticated;
create policy staff_write on public.movies for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.movies for each row execute function private.audit();
grant select,insert,update,delete on public.genres to authenticated;
create policy staff_write on public.genres for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.genres for each row execute function private.audit();
grant select,insert,update,delete on public.movie_genres to authenticated;
create policy staff_write on public.movie_genres for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.movie_genres for each row execute function private.audit();
grant select,insert,update,delete on public.cast_members to authenticated;
create policy staff_write on public.cast_members for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.cast_members for each row execute function private.audit();
grant select,insert,update,delete on public.movie_cast to authenticated;
create policy staff_write on public.movie_cast for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.movie_cast for each row execute function private.audit();
grant select,insert,update,delete on public.video_assets to authenticated;
create policy staff_write on public.video_assets for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.video_assets for each row execute function private.audit();
grant select,insert,update,delete on public.subtitle_tracks to authenticated;
create policy staff_write on public.subtitle_tracks for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.subtitle_tracks for each row execute function private.audit();
grant select,insert,update,delete on public.content_licenses to authenticated;
create policy staff_write on public.content_licenses for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.content_licenses for each row execute function private.audit();
grant select,insert,update,delete on public.collections to authenticated;
create policy staff_write on public.collections for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.collections for each row execute function private.audit();
grant select,insert,update,delete on public.collection_movies to authenticated;
create policy staff_write on public.collection_movies for all to authenticated using ((select private.level())>=1) with check ((select private.level())>=1);
create trigger audit_change after insert or update or delete on public.collection_movies for each row execute function private.audit();
grant select,insert,update,delete on public.roles to authenticated;
create policy staff_write on public.roles for all to authenticated using ((select private.level())>=3) with check ((select private.level())>=3);
create trigger audit_change after insert or update or delete on public.roles for each row execute function private.audit();
grant select,insert,update,delete on public.site_settings to authenticated;
create policy staff_write on public.site_settings for all to authenticated using ((select private.level())>=2) with check ((select private.level())>=2);
create trigger audit_change after insert or update or delete on public.site_settings for each row execute function private.audit();
grant select on public.movies,public.genres,public.cast_members,public.movie_genres,public.movie_cast,public.collections,public.collection_movies,public.site_settings,public.analytics_daily to anonymous,authenticated;
create policy released on public.movies for select using(state='published' and release_at<=now());
create policy brand_read on public.site_settings for select using(key='brand');
create policy own_role on public.roles for select to authenticated using(user_id=(select auth.uid()) or (select private.level())>=2);
grant select,update,insert,delete on public.profiles,public.watchlists,public.watch_progress,public.ratings to authenticated;
create policy profile_owner on public.profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy profile_admin on public.profiles for select to authenticated using((select private.level())>=2);
grant select,insert,update on public.user_reports to authenticated;
create policy owner_reports on public.user_reports for select to authenticated using(user_id=(select auth.uid()));
create policy report_insert on public.user_reports for insert to authenticated with check(user_id=(select auth.uid()) and status='open');
create policy report_admin_read on public.user_reports for select to authenticated using((select private.level())>=2);
create policy report_admin_update on public.user_reports for update to authenticated using((select private.level())>=2) with check((select private.level())>=2);
create trigger audit_reports after update on public.user_reports for each row execute function private.audit();
grant select on public.admin_audit_logs to authenticated;
create policy staff_audit on public.admin_audit_logs for select to authenticated using((select private.level())>=2);
create policy read_labels on public.genres for select using(true);
create policy read_labels on public.collections for select using(true);
create policy released_links on public.movie_genres for select using(exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy released_links on public.movie_cast for select using(exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy released_links on public.collection_movies for select using(exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy released_links on public.analytics_daily for select using(exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy released_cast on public.cast_members for select using(exists(select 1 from public.movie_cast mc where mc.cast_id=id));
create policy own_rows on public.watchlists for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy own_rows on public.watch_progress for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create policy own_rows on public.ratings for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.movies m where m.id=movie_id and m.state='published' and m.release_at<=now()));
create view public.catalog with(security_invoker=true) as select m.id,m.title,m.slug,m.synopsis,m.year,m.duration,m.language,m.country,m.classification,m.director,m.poster,m.backdrop,m.trailer,m.featured,m.created_at,
array(select g.name from public.genres g join public.movie_genres mg on mg.genre_id=g.id where mg.movie_id=m.id order by g.name) genres,
array(select c.name from public.cast_members c join public.movie_cast mc on mc.cast_id=c.id where mc.movie_id=m.id) cast_names,
array(select c.name from public.collections c join public.collection_movies cm on cm.collection_id=c.id where cm.movie_id=m.id order by c.sort_order) collection_names,
coalesce((select sum(a.plays) from public.analytics_daily a where a.movie_id=m.id),0)::int plays,
coalesce((select sum(a.plays) from public.analytics_daily a where a.movie_id=m.id and a.day>=current_date-6),0)::int recent_plays
from public.movies m where state='published' and release_at<=now();
grant select on public.catalog to anonymous,authenticated,netfly_service;
create function private.entitled(film uuid,country_code text) returns boolean language sql stable set search_path='' as $$
select exists(select 1 from public.movies m join public.content_licenses l on l.movie_id=m.id join public.video_assets v on v.movie_id=m.id where m.id=film and m.state='published' and m.release_at<=now() and now()>=l.starts_at and now()<l.ends_at and ('*'=any(l.territories) or country_code=any(l.territories))) $$;
create function public.start_playback(viewer uuid,film uuid,session_key uuid,digest text,country_code text) returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid;begin
perform pg_advisory_xact_lock(hashtext(viewer::text));
if not exists(select 1 from neon_auth.session where id=session_key and user_id=viewer) or not private.entitled(film,country_code) then raise exception 'Playback unavailable';end if;
if (select count(*) from public.playback_sessions where user_id=viewer and expires_at>now())>=4 then raise exception 'Active screen limit reached';end if;
insert into public.playback_sessions(user_id,movie_id,auth_session,token_hash,territory,expires_at) values(viewer,film,session_key,digest,country_code,now()+interval '2 minutes') returning id into result;return result; end $$;
create function public.resolve_media(digest text,country_code text) returns uuid language sql stable security definer set search_path='' as $$
select v.prefix from public.playback_sessions s join public.video_assets v on v.movie_id=s.movie_id join neon_auth.session a on a.id=s.auth_session and a.user_id=s.user_id where s.token_hash=digest and s.territory=country_code and s.expires_at>now() and private.entitled(s.movie_id,country_code) $$;
create function public.heartbeat(viewer uuid,play_id uuid,session_key uuid,country_code text,watched int,finished boolean,failed_play boolean,closing boolean) returns boolean language plpgsql security definer set search_path='' as $$ begin
update public.playback_sessions s set watch_seconds=watch_seconds+least(greatest(0,watched),60,greatest(0,ceil(extract(epoch from now()-seen_at))::int)),seen_at=now(),completed=completed or finished,failed=failed or failed_play,expires_at=case when closing then now() else now()+interval '2 minutes' end where id=play_id and user_id=viewer and auth_session=session_key and exists(select 1 from neon_auth.session where id=session_key and user_id=viewer) and territory=country_code and expires_at>now() and private.entitled(movie_id,country_code);return found;end $$;
create function public.maintain_cinema() returns void language plpgsql set search_path='' as $$ begin
insert into public.analytics_daily(day,movie_id,plays,seconds,completions,failures) select (created_at at time zone 'UTC')::date,movie_id,count(*),sum(watch_seconds),count(*) filter(where completed),count(*) filter(where failed) from public.playback_sessions where created_at>=current_date-3 group by 1,2 on conflict(day,movie_id) do update set plays=excluded.plays,seconds=excluded.seconds,completions=excluded.completions,failures=excluded.failures;
delete from public.playback_sessions where created_at<now()-interval '30 days';delete from public.watch_progress where updated_at<now()-interval '180 days';delete from public.user_reports where status='resolved' and created_at<now()-interval '180 days';delete from public.admin_audit_logs where created_at<now()-interval '365 days';end $$;
create function public.cinema_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin if private.level()<2 then raise exception 'Administrator access required';end if; return jsonb_build_object(
'Registered users',(select count(*) from neon_auth."user"),'Published films',(select count(*) from public.movies where state='published' and release_at<=now()),'Active viewers (24h)',(select count(distinct user_id) from public.playback_sessions where seen_at>=now()-interval '24 hours'),'Concurrent viewers (estimate)',(select count(distinct user_id) from public.playback_sessions where seen_at>now()-interval '60 seconds' and expires_at>now()),'Sessions (30 days)',(select count(*) from public.playback_sessions where created_at>=now()-interval '30 days'),'Watch minutes (30 days)',(select coalesce(sum(watch_seconds),0)/60 from public.playback_sessions where created_at>=now()-interval '30 days'),'Completion rate % (30 days)',(select round(100.0*count(*) filter(where completed)/nullif(count(*),0),1) from public.playback_sessions where created_at>=now()-interval '30 days'),'Playback failures (30 days)',(select count(*) from public.playback_sessions where failed and created_at>=now()-interval '30 days'),'Registered media bytes',(select coalesce(sum(bytes),0) from public.video_assets),'Most watched film (30 days)',(select m.title from public.movies m join public.playback_sessions s on s.movie_id=m.id where s.created_at>=now()-interval '30 days' group by m.id order by count(*) desc limit 1),'Most watched genre (30 days)',(select g.name from public.genres g join public.movie_genres mg on mg.genre_id=g.id join public.playback_sessions s on s.movie_id=mg.movie_id where s.created_at>=now()-interval '30 days' group by g.id order by count(*) desc limit 1));end $$;
revoke all on function public.cinema_overview() from public, anonymous,authenticated;grant execute on function public.cinema_overview() to authenticated;
revoke all on function public.start_playback(uuid,uuid,uuid,text,text) from public,anonymous,authenticated;grant execute on function public.start_playback(uuid,uuid,uuid,text,text) to netfly_service;
revoke all on function public.resolve_media(text,text) from public,anonymous,authenticated;grant execute on function public.resolve_media(text,text) to netfly_service;
revoke all on function public.heartbeat(uuid,uuid,uuid,text,int,boolean,boolean,boolean) from public,anonymous,authenticated;grant execute on function public.heartbeat(uuid,uuid,uuid,text,int,boolean,boolean,boolean) to netfly_service;
revoke all on function public.maintain_cinema() from public,anonymous,authenticated;grant execute on function public.maintain_cinema() to netfly_service;
revoke all on function private.entitled(uuid,text),private.audit(),private.on_signup(),private.stamp() from public;grant execute on function private.entitled(uuid,text) to netfly_service;
insert into public.site_settings values('brand','{"name":"Netfly"}'),('quotas','{"storageGB":10,"thresholds":[70,85,95]}');
insert into public.genres(name) values('African Cinema'),('Action'),('Comedy'),('Drama'),('Horror'),('Thriller'),('Romance'),('Science Fiction'),('Documentary'),('Nature'),('Adventure'),('Urban');
insert into public.collections(name) values('The screening room');
create function private.report_limit() returns trigger language plpgsql security definer set search_path='' as $$ begin
if new.user_id is not null then
perform pg_advisory_xact_lock(hashtext('report-'||new.user_id::text));
if (select count(*) from public.user_reports where user_id=new.user_id and created_at>now()-interval '1 hour')>=12 then raise exception 'Hourly report limit reached';end if;
end if;new.created_at=now();return new;end $$;
create trigger report_limit before insert on public.user_reports for each row execute function private.report_limit();
revoke all on function private.report_limit() from public;
create index reports_owner_created on public.user_reports(user_id,created_at);
create index mg_genre on public.movie_genres(genre_id);
create index mc_cast on public.movie_cast(cast_id);
create index cm_collection on public.collection_movies(collection_id,sort_order);
create index sessions_seen on public.playback_sessions(seen_at);
create index aggregated_movie_day on public.analytics_daily(movie_id,day);


commit;

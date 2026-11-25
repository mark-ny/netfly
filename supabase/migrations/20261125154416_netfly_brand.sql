begin;

-- Keep a custom site name and any other keys in the settings object.
update public.site_settings
set value = jsonb_set(value, '{name}', '"Netfly"'::jsonb)
where key = 'brand' and value->>'name' = 'Stillframe';

-- Update only the bundled demo credits on an existing seeded installation.
update public.movies
set director = 'Netfly Studio'
where director = 'Stillframe Studio'
  and id between '00000000-0000-4000-8000-000000000001'::uuid
             and '00000000-0000-4000-8000-000000000008'::uuid;

commit;

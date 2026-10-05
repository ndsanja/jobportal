-- Karir Pro — Fase 0: fondasi skema (referensi, registry sumber, profil, admin)

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Admin ditentukan lewat klaim JWT app_metadata.role = 'admin'
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

create type public.track as enum ('whv_au', 'dama_au', 'professional', 'overseas', 'scholarship');
create type public.source_kind as enum ('api', 'ats', 'jsonld', 'csv', 'monitor', 'manual', 'deeplink');
create type public.source_authority as enum ('government', 'institution', 'employer', 'aggregator', 'community');
create type public.source_status as enum ('active', 'paused', 'failing', 'draft');

-- ---------------------------------------------------------------------------
-- Referensi
-- ---------------------------------------------------------------------------

create table public.countries (
  code char(2) primary key,
  name_id text not null,
  name_en text not null,
  flag text not null,
  currency char(3),
  region text not null
);

create table public.tracks (
  code public.track primary key,
  name text not null,
  description text not null,
  sort_order smallint not null default 0
);

create table public.document_types (
  code text primary key,
  name text not null,
  category text not null check (category in ('identitas', 'pendidikan', 'bahasa', 'karier', 'legal', 'kesehatan', 'keuangan', 'sertifikat', 'lainnya')),
  has_expiry boolean not null default false,
  is_sensitive boolean not null default false,
  description text,
  guide_url text,
  sort_order smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- Registry sumber data (dipakai worker ingestion)
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kind public.source_kind not null,
  authority public.source_authority not null,
  trust_score smallint not null check (trust_score between 0 and 100),
  tracks public.track[] not null default '{}',
  country_code char(2) references public.countries (code),
  base_url text not null,
  config jsonb not null default '{}'::jsonb,
  schedule text not null default 'daily' check (schedule in ('hourly', '6h', '12h', 'daily', 'weekly', 'monthly', 'manual')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  failure_count integer not null default 0,
  status public.source_status not null default 'draft',
  terms_note text,
  attribution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  birth_date date,
  city text,
  education_level text check (education_level in ('sma', 'd3', 'd4', 's1', 's2', 's3')),
  field_of_study text,
  years_experience smallint check (years_experience between 0 and 60),
  english_level text check (english_level in ('dasar', 'menengah', 'mahir', 'fasih')),
  target_tracks public.track[] not null default '{}',
  target_countries char(2)[] not null default '{}',
  target_departure date,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Email yang otomatis menjadi admin saat mendaftar
create table public.admin_emails (
  email text primary key
);

insert into public.admin_emails (email) values ('ndsanja@gmail.com');

-- Tandai admin sebelum user tersimpan, supaya klaim langsung ada di JWT pertama
create or replace function public.handle_auth_user_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_emails a where a.email = lower(new.email)) then
    new.raw_app_meta_data = coalesce(new.raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_before_insert_admin
  before insert on auth.users
  for each row execute function public.handle_auth_user_admin();

-- Buat profil kosong untuk setiap user baru
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_auth_user_admin() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.countries enable row level security;
alter table public.tracks enable row level security;
alter table public.document_types enable row level security;
alter table public.sources enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_emails enable row level security;

-- Referensi: baca publik, tulis admin
create policy "countries dapat dibaca publik" on public.countries for select to anon, authenticated using (true);
create policy "countries dikelola admin" on public.countries for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "tracks dapat dibaca publik" on public.tracks for select to anon, authenticated using (true);
create policy "tracks dikelola admin" on public.tracks for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "document_types dapat dibaca publik" on public.document_types for select to anon, authenticated using (true);
create policy "document_types dikelola admin" on public.document_types for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Sumber: hanya admin (worker memakai secret key)
create policy "sources dikelola admin" on public.sources for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Profil: hanya pemilik
create policy "profil dibaca pemilik" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profil diubah pemilik" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- admin_emails: hanya admin
create policy "admin_emails dikelola admin" on public.admin_emails for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

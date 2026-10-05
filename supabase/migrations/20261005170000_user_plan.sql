-- Karir Pro — Fase 2: dokumen pengguna (metadata, tanpa unggah file) dan Rencana (bookmark yang hidup)

create table public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_type text not null references public.document_types (code),
  status text not null default 'missing' check (status in ('have', 'in_progress', 'missing')),
  issued_on date,
  expires_on date,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_type)
);

create index user_documents_type_idx on public.user_documents (document_type);

create trigger user_documents_set_updated_at
  before update on public.user_documents
  for each row execute function public.set_updated_at();

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  stage text not null default 'saved'
    check (stage in ('saved', 'preparing', 'ready', 'applied', 'interview', 'accepted', 'rejected')),
  notes text check (char_length(notes) <= 1000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index plan_items_user_stage_idx on public.plan_items (user_id, stage);
create index plan_items_opportunity_idx on public.plan_items (opportunity_id);

create trigger plan_items_set_updated_at
  before update on public.plan_items
  for each row execute function public.set_updated_at();

alter table public.user_documents enable row level security;
alter table public.plan_items enable row level security;

create policy "dokumen dibaca pemilik" on public.user_documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "dokumen dibuat pemilik" on public.user_documents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dokumen diubah pemilik" on public.user_documents
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dokumen dihapus pemilik" on public.user_documents
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "rencana dibaca pemilik" on public.plan_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "rencana dibuat pemilik" on public.plan_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "rencana diubah pemilik" on public.plan_items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rencana dihapus pemilik" on public.plan_items
  for delete to authenticated using ((select auth.uid()) = user_id);

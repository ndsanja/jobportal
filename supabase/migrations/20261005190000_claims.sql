-- Karir Pro — Mesin riset: klaim (fakta yang diusulkan) + bukti (kutipan dari sumber) + skor keyakinan.
-- Kebenaran ditentukan oleh bukti dan tingkat sumber (official > reputable > community), bukan oleh AI.

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('opportunity', 'track')),
  -- kunci subjek: 'opportunity:<uuid>' atau 'track:<kode>' (dipakai untuk keunikan)
  subject_key text not null,
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  track public.track,
  field text not null,
  value jsonb not null,
  value_key text not null,
  summary text not null check (char_length(summary) <= 300),
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'disputed', 'rejected', 'superseded')),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  evidence_count integer not null default 0,
  decided_by text not null default 'system' check (decided_by in ('system', 'admin')),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (subject_type = 'opportunity' and opportunity_id is not null and track is null)
    or (subject_type = 'track' and track is not null and opportunity_id is null)
  ),
  unique (subject_key, field, value_key)
);

create index claims_opportunity_idx on public.claims (opportunity_id) where opportunity_id is not null;
create index claims_track_idx on public.claims (track) where track is not null;
create index claims_status_idx on public.claims (status);

create trigger claims_set_updated_at
  before update on public.claims
  for each row execute function public.set_updated_at();

create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  source_url text not null,
  source_domain text not null,
  source_tier text not null check (source_tier in ('official', 'reputable', 'community')),
  stance text not null default 'supports' check (stance in ('supports', 'contradicts')),
  quote text not null check (char_length(quote) <= 600),
  quote_key text not null,
  page_hash text,
  model text,
  retrieved_at timestamptz not null default now(),
  unique (claim_id, source_url, quote_key)
);

alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;

create policy "claims dapat dibaca" on public.claims
  for select to anon, authenticated
  using (status in ('accepted', 'disputed') or (select public.is_admin()));
create policy "claims dibuat admin" on public.claims
  for insert to authenticated with check ((select public.is_admin()));
create policy "claims diubah admin" on public.claims
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "claims dihapus admin" on public.claims
  for delete to authenticated using ((select public.is_admin()));

create policy "claim_evidence dapat dibaca" on public.claim_evidence
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.claims c where c.id = claim_id and c.status in ('accepted', 'disputed'))
  );
create policy "claim_evidence dibuat admin" on public.claim_evidence
  for insert to authenticated with check ((select public.is_admin()));
create policy "claim_evidence diubah admin" on public.claim_evidence
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "claim_evidence dihapus admin" on public.claim_evidence
  for delete to authenticated using ((select public.is_admin()));

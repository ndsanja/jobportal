-- Jadwal "20m" untuk riset otomatis peluang (cron research tiap 20 menit; run tanpa subjek jatuh tempo murah).
alter table public.sources drop constraint if exists sources_schedule_check;
alter table public.sources add constraint sources_schedule_check
  check (schedule in ('20m', 'hourly', '6h', '12h', 'daily', 'weekly', 'monthly', 'manual'));
update public.sources set schedule = '20m' where slug = 'research-opportunities';

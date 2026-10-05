-- pg_net: HTTP asinkron dari database, dipakai pg_cron untuk memanggil /api/ingest/run
create extension if not exists pg_net with schema extensions;

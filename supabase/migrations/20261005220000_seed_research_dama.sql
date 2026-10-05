-- Agen riset DAMA Australia (status draft). Uji dulu: POST /api/ingest/run?slug=research-dama-au&dry_run=1
insert into public.sources (slug, name, kind, authority, trust_score, tracks, country_code, base_url, config, schedule, status, terms_note)
values
  ('research-dama-au', 'Riset DAMA Australia', 'monitor', 'government', 90, '{dama_au}', 'AU',
   'https://immi.homeaffairs.gov.au',
   $j${"provider":"research_agent","group":"research","subject":{"type":"track","track":"dama_au"},
   "description":"Designated Area Migration Agreement (DAMA) Australia untuk pekerja asal Indonesia: cara kerja dan alur (endorsement dari otoritas area DAMA lalu visa 482/186), syarat pemohon dan pemberi kerja, kelonggaran (usia, bahasa Inggris, pengalaman, gaji), daftar area dan okupasi, biaya, dan jadwal",
   "queries":[
     "Designated Area Migration Agreement DAMA Australia how it works employer endorsement",
     "site:immi.homeaffairs.gov.au Designated Area Migration Agreements DAMA",
     "site:immi.homeaffairs.gov.au DAMA concessions age English language skills assessment salary",
     "DAMA labour agreement subclass 482 186 designated area occupation list concessions",
     "site:immi.homeaffairs.gov.au Skills in Demand visa subclass 482 DAMA",
     "DAMA regions Northern Territory Goldfields Orana Far North Queensland Great South Coast how to apply endorsement",
     {"q":"DAMA Australia 2026 changes Skills in Demand visa designated area","recency":"year"},
     {"q":"DAMA Australia pekerja Indonesia syarat endorsement visa 482 186","recency":"year"}
   ],
   "official_domains":["immi.homeaffairs.gov.au","homeaffairs.gov.au","dfat.gov.au","imigrasi.go.id"],
   "max_pages":10,"results_per_query":5}$j$::jsonb,
   'weekly', 'draft', 'Wilayah DAMA memiliki otoritas sendiri (situs .gov.au dan beberapa .com.au); situs .gov.au otomatis dianggap resmi.')
on conflict (slug) do nothing;

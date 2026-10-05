export const STUDY_LEVEL_LABEL: Record<string, string> = {
  bachelor: "Sarjana",
  master: "Magister",
  doctoral: "Doktor",
  non_degree: "Non-gelar",
};

export const EVENT_KIND_LABEL: Record<string, string> = {
  open: "Pendaftaran dibuka",
  close: "Tenggat",
  test: "Seleksi / tes",
  interview: "Wawancara",
  announcement: "Pengumuman",
  ballot_open: "Ballot dibuka",
  ballot_close: "Ballot ditutup",
  start: "Mulai",
};

export const EVENT_KIND_TONE: Record<string, string> = {
  close: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  announcement: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

export const levelsLabel = (levels: string[]): string =>
  levels.map((level) => STUDY_LEVEL_LABEL[level] ?? level).join(" · ");

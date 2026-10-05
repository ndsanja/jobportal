const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeZone: "UTC",
});

export const formatDate = (value: string | Date): string =>
  dateFormat.format(new Date(value));

const wibDate = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeZone: "Asia/Jakarta",
});
const wibTime = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

/** Tenggat dalam WIB; jam hanya ditampilkan bila tertulis di sumber resmi ("exact"). */
export function formatDeadline(
  value: string,
  precision?: string | null,
): string {
  const date = new Date(value);
  return precision === "exact"
    ? `${wibDate.format(date)}, ${wibTime.format(date)} WIB`
    : wibDate.format(date);
}

export function formatSalary(opportunity: {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
}): string | null {
  const {
    salary_min: min,
    salary_max: max,
    salary_currency: currency,
    salary_period: period,
  } = opportunity;
  if (!currency || (min == null && max == null)) return null;

  const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const range =
    min != null && max != null && min !== max
      ? `${number.format(min)} – ${number.format(max)}`
      : number.format((min ?? max) as number);
  const unit = {
    hour: "jam",
    day: "hari",
    week: "minggu",
    month: "bulan",
    year: "tahun",
  }[period ?? ""];
  return `${currency} ${range}${unit ? ` / ${unit}` : ""}`;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

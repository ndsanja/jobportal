import type { Metadata } from "next";
import Link from "next/link";
import {
  EDUCATION_LABEL,
  EDUCATION_LEVELS,
  ENGLISH_LABEL,
  ENGLISH_LEVELS,
} from "@/domain/profile";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

export const metadata: Metadata = { title: "Profil — Karir Pro" };

const TRACK_OPTIONS = [
  { value: "whv_au", label: "WHV Australia" },
  { value: "dama_au", label: "DAMA Australia" },
  { value: "professional", label: "Kerja profesional" },
  { value: "overseas", label: "Kerja luar negeri" },
  { value: "scholarship", label: "Beasiswa" },
];

const inputClass =
  "mt-1 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300";

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  const supabase = await createClient();
  const [{ data: profile }, { data: countries }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("countries")
      .select("code, name_id, flag")
      .neq("code", "ID")
      .order("name_id"),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <Link
        href="/saya"
        className="text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Ruang saya
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Profil &amp; tujuan Anda
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Semua isian opsional. Data ini hanya dipakai untuk menyesuaikan
        rekomendasi dan tidak dibagikan ke pihak lain.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <form action={saveProfile} className="mt-8 space-y-8">
        <fieldset>
          <legend className="font-medium">Tujuan</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {TRACK_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="target_tracks"
                  value={option.value}
                  defaultChecked={profile?.target_tracks?.includes(
                    option.value as never,
                  )}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-medium">Negara tujuan</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(countries ?? []).map((country) => (
              <label
                key={country.code}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="target_countries"
                  value={country.code}
                  defaultChecked={profile?.target_countries?.includes(
                    country.code,
                  )}
                />
                <span>
                  {country.flag} {country.name_id}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="font-medium">Tentang Anda</legend>
          <label className="block text-sm sm:col-span-2">
            Nama lengkap
            <input
              name="full_name"
              defaultValue={profile?.full_name ?? ""}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Tanggal lahir
            <input
              type="date"
              name="birth_date"
              defaultValue={profile?.birth_date ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Kota domisili
            <input
              name="city"
              defaultValue={profile?.city ?? ""}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Pendidikan terakhir
            <select
              name="education_level"
              defaultValue={profile?.education_level ?? ""}
              className={inputClass}
            >
              <option value="">—</option>
              {EDUCATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {EDUCATION_LABEL[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Bidang studi
            <input
              name="field_of_study"
              defaultValue={profile?.field_of_study ?? ""}
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Pengalaman kerja (tahun)
            <input
              type="number"
              name="years_experience"
              min={0}
              max={60}
              defaultValue={profile?.years_experience ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Bahasa Inggris
            <select
              name="english_level"
              defaultValue={profile?.english_level ?? ""}
              className={inputClass}
            >
              <option value="">—</option>
              {ENGLISH_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ENGLISH_LABEL[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            Target berangkat
            <input
              type="date"
              name="target_departure"
              defaultValue={profile?.target_departure ?? ""}
              className={inputClass}
            />
          </label>
        </fieldset>

        <button
          type="submit"
          className="h-11 rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Simpan profil
        </button>
      </form>
    </main>
  );
}

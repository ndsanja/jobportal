"use server";

import { redirect } from "next/navigation";
import { parseProfileForm } from "@/domain/profile";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const user = await requireUser("/onboarding");

  const parsed = parseProfileForm(formData);
  if (!parsed.ok)
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error)}`);
  const data = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.full_name ?? null,
      birth_date: data.birth_date ?? null,
      city: data.city ?? null,
      education_level: data.education_level ?? null,
      field_of_study: data.field_of_study ?? null,
      years_experience: data.years_experience ?? null,
      english_level: data.english_level ?? null,
      target_tracks: data.target_tracks,
      target_countries: data.target_countries,
      target_departure: data.target_departure ?? null,
      onboarding_completed: true,
    })
    .eq("id", user.id);

  if (error)
    redirect(
      `/onboarding?error=${encodeURIComponent("Gagal menyimpan profil. Coba lagi.")}`,
    );
  redirect("/saya");
}

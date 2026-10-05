"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPlanStage } from "@/domain/plan";
import { requireUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Menambahkan peluang ke Rencana. Belum masuk → diarahkan ke /masuk lalu kembali ke halaman asal. */
export async function addToPlan(formData: FormData) {
  const returnTo = safeNextPath(
    String(formData.get("return_to") ?? ""),
    "/saya/rencana",
  );
  const user = await requireUser(returnTo);

  const opportunityId = String(formData.get("opportunity_id") ?? "");
  if (!isUuid(opportunityId)) redirect(returnTo);

  const supabase = await createClient();
  const { error } = await supabase
    .from("plan_items")
    .upsert(
      { user_id: user.id, opportunity_id: opportunityId },
      { onConflict: "user_id,opportunity_id", ignoreDuplicates: true },
    );
  if (error) redirect(`${returnTo}?plan=error`);

  revalidatePath("/saya/rencana");
  redirect("/saya/rencana");
}

export async function setStage(formData: FormData) {
  const user = await requireUser("/saya/rencana");
  const id = String(formData.get("id") ?? "");
  const stage = formData.get("stage");
  if (!isUuid(id) || !isPlanStage(stage)) redirect("/saya/rencana");

  const supabase = await createClient();
  await supabase
    .from("plan_items")
    .update({ stage })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/saya/rencana");
}

export async function togglePin(formData: FormData) {
  const user = await requireUser("/saya/rencana");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/saya/rencana");
  const pinned = formData.get("pinned") === "true";

  const supabase = await createClient();
  await supabase
    .from("plan_items")
    .update({ pinned: !pinned })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/saya/rencana");
}

export async function removeFromPlan(formData: FormData) {
  const user = await requireUser("/saya/rencana");
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) redirect("/saya/rencana");

  const supabase = await createClient();
  await supabase
    .from("plan_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/saya/rencana");
}

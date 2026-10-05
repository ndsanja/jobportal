"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { documentInputSchema } from "@/domain/documents";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function saveDocument(formData: FormData) {
  const user = await requireUser("/saya/dokumen");

  const parsed = documentInputSchema.safeParse({
    document_type: formData.get("document_type"),
    status: formData.get("status"),
    issued_on: formData.get("issued_on"),
    expires_on: formData.get("expires_on"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Isian dokumen tidak valid.";
    redirect(`/saya/dokumen?error=${encodeURIComponent(message)}`);
  }
  const doc = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("user_documents").upsert(
    {
      user_id: user.id,
      document_type: doc.document_type,
      status: doc.status,
      issued_on: doc.issued_on ?? null,
      expires_on: doc.expires_on ?? null,
      notes: doc.notes ?? null,
    },
    { onConflict: "user_id,document_type" },
  );
  if (error)
    redirect(
      `/saya/dokumen?error=${encodeURIComponent("Gagal menyimpan dokumen.")}`,
    );

  revalidatePath("/saya/dokumen");
}

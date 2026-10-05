import { addToPlan } from "@/app/saya/rencana/actions";

/** Tombol "Tambah ke Rencana". Aksi server yang mengarahkan ke /masuk bila belum login. */
export function AddToPlanButton({
  opportunityId,
  returnTo,
}: {
  opportunityId: string;
  returnTo: string;
}) {
  return (
    <form action={addToPlan}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        type="submit"
        className="inline-flex h-11 items-center rounded-lg border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        ⭐ Tambah ke Rencana
      </button>
    </form>
  );
}

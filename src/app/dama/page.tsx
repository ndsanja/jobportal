import type { Metadata } from "next";
import { TrackGuide } from "@/components/track-guide";

export const metadata: Metadata = {
  title: "DAMA Australia untuk pekerja Indonesia — Karir Pro",
  description:
    "Cara kerja Designated Area Migration Agreement (DAMA), syarat, kelonggaran, dan biayanya, dikumpulkan dan diverifikasi dari sumber resmi lengkap dengan bukti.",
};

export default function DamaPage() {
  return (
    <TrackGuide
      track="dama_au"
      path="/dama"
      heading="DAMA Australia (Designated Area Migration Agreement)"
      intro="Jalur visa kerja berbasis sponsor pemberi kerja di wilayah tertentu Australia. Setiap butir dikumpulkan mesin riset kami dari halaman resmi dan sumber lain, disertai kutipan bukti dan tingkat keyakinan. Tetap cek halaman resmi Home Affairs dan otoritas wilayah DAMA sebelum melamar."
      jobsHref="/lowongan?track=dama_au"
      jobsLabel="Lihat lowongan DAMA"
    />
  );
}

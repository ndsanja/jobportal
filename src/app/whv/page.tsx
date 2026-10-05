import type { Metadata } from "next";
import { TrackGuide } from "@/components/track-guide";

export const metadata: Metadata = {
  title: "WHV Australia (subclass 462) untuk WNI — Karir Pro",
  description:
    "Syarat Work and Holiday visa 462 untuk paspor Indonesia, dikumpulkan dan diverifikasi dari sumber resmi, lengkap dengan bukti dan tingkat keyakinan.",
};

export default function WhvPage() {
  return (
    <TrackGuide
      track="whv_au"
      path="/whv"
      heading="Work and Holiday visa Australia (subclass 462)"
      intro="Syarat untuk pemegang paspor Indonesia. Setiap syarat dikumpulkan mesin riset kami dari halaman resmi dan sumber lain, disertai kutipan bukti dan tingkat keyakinan. Tetap cek halaman resmi Home Affairs sebelum mendaftar."
      jobsHref="/lowongan?track=whv_au"
      jobsLabel="Lihat lowongan WHV"
    />
  );
}

import type {
  NormalizedOpportunity,
  SourceAuthority,
  SourceKind,
  Track,
} from "@/domain/opportunity";

export type IngestSource = {
  id: string;
  slug: string;
  name: string;
  kind: SourceKind;
  authority: SourceAuthority;
  trustScore: number;
  tracks: Track[];
  countryCode: string | null;
  attribution: string | null;
  config: unknown;
};

export type AdapterResult = {
  items: NormalizedOpportunity[];
  /** Entri mentah yang gagal divalidasi dan dilewati. */
  skipped: number;
  /**
   * true bila feed memuat SEMUA lowongan aktif sumber (mis. career page ATS):
   * lowongan yang hilang dari feed dianggap sudah ditutup.
   */
  fullFeed: boolean;
};

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

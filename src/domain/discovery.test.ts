import { describe, expect, it } from "vitest";
import {
  extractHtmlLinks,
  extractMarkdownLinks,
  findDuplicate,
  nameKey,
  nameSimilarity,
  pageMentionsName,
  pickQueries,
  scoreCandidate,
  validateCandidates,
} from "./discovery";

const now = new Date("2026-10-06T00:00:00Z");

describe("tautan halaman", () => {
  it("mengambil tautan HTML absolut dan membuang media sosial/berkas", () => {
    const links = extractHtmlLinks(
      `<a href="/apply">Apply <b>now</b></a>
       <a href="https://facebook.com/x">FB</a>
       <a href="https://mext.go.jp/en/scholarship">MEXT Scholarship</a>
       <a href="/brochure.pdf#p2">PDF</a>
       <a href="mailto:a@b.c">Mail</a>`,
      "https://example.org/list/",
    );
    expect(links).toEqual([
      { text: "Apply now", url: "https://example.org/apply" },
      { text: "MEXT Scholarship", url: "https://mext.go.jp/en/scholarship" },
      { text: "PDF", url: "https://example.org/brochure.pdf" },
    ]);
  });

  it("mengambil tautan markdown", () => {
    expect(
      extractMarkdownLinks(
        "See [Swedish Institute Scholarships](https://si.se/en/apply/) and [x](https://t.me/a)",
        "https://blog.example",
      ),
    ).toEqual([
      {
        text: "Swedish Institute Scholarships",
        url: "https://si.se/en/apply/",
      },
    ]);
  });
});

describe("nama & duplikat", () => {
  it("kunci nama mengabaikan kata umum dan tahun", () => {
    expect(nameKey("MEXT Scholarship 2027 for International Students")).toBe(
      "mext",
    );
    expect(nameKey("Beasiswa Chevening")).toBe(
      nameKey("Chevening Scholarships"),
    );
  });

  it("mendeteksi duplikat lewat nama mirip atau URL resmi sama", () => {
    const known = [
      {
        id: "1",
        title: "Chevening Scholarships — Indonesia",
        organizationName: "Chevening",
        officialUrl: "https://www.chevening.org/scholarships/",
        applyUrl: "https://www.chevening.org/scholarship/indonesia/",
      },
    ];
    expect(
      findDuplicate({ name: "Chevening Scholarship", officialUrl: null }, known)
        ?.id,
    ).toBe("1");
    expect(
      findDuplicate(
        {
          name: "UK Government Award",
          officialUrl: "https://chevening.org/scholarships",
        },
        known,
      )?.id,
    ).toBe("1");
    expect(
      findDuplicate(
        { name: "Swedish Institute Scholarships", officialUrl: null },
        known,
      ),
    ).toBeNull();
    expect(
      nameSimilarity(
        "Erasmus Mundus Joint Masters",
        "Erasmus Mundus Joint Master Degrees",
      ),
    ).toBeGreaterThan(0.4);
  });

  it("memeriksa nama disebut di halaman resmi", () => {
    expect(
      pageMentionsName(
        "Apply for the Swedish Institute Scholarships for Global Professionals",
        "Swedish Institute Scholarships for Global Professionals",
      ),
    ).toBe(true);
    expect(
      pageMentionsName(
        "Welcome to our university homepage",
        "Swedish Institute Scholarships",
      ),
    ).toBe(false);
  });
});

describe("validateCandidates", () => {
  const page = {
    text: "The Swedish Institute Scholarships for Global Professionals are open to citizens of Indonesia. Applications close on 26 February 2027. Another: Local Grant for EU citizens only.",
    links: [
      { text: "SI Scholarships", url: "https://si.se/en/apply/scholarships/" },
    ],
  };
  const base = {
    name: "Swedish Institute Scholarships for Global Professionals",
    organizer: "Swedish Institute",
    kind: "scholarship",
    country: "se",
    levels: ["master"],
    official_link: 1,
    open_to_indonesia: "yes",
    deadline: "2027-02-26",
    summary:
      "Beasiswa magister di Swedia untuk profesional, terbuka untuk WNI.",
    evidence: "Applications close on 26 February 2027",
  };

  it("menerima kandidat berkutipan dengan tautan resmi bernomor", () => {
    const result = validateCandidates(
      { candidates: [base] },
      page,
      "scholarship",
      now,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      officialUrl: "https://si.se/en/apply/scholarships/",
      countryCode: "SE",
      deadline: "2027-02-26",
    });
  });

  it("membuang kandidat tanpa kutipan, tautan karangan, tidak untuk WNI, atau jenis salah", () => {
    const result = validateCandidates(
      {
        candidates: [
          { ...base, evidence: "kutipan karangan yang tidak ada" },
          { ...base, name: "Lain", official_link: 9 },
          { ...base, name: "Local Grant", open_to_indonesia: "no" },
          { ...base, name: "Program kerja", kind: "program" },
          { ...base, name: "Tenggat salah", deadline: "2027-03-01" },
        ],
      },
      page,
      "scholarship",
      now,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "Kutipan tidak ditemukan di halaman",
      "Nomor tautan tidak ada",
      "Tidak terbuka untuk WNI",
      "Jenis tidak sesuai target",
    ]);
    // tenggat yang tidak tertulis di kutipan dibuang, kandidatnya tetap
    expect(result.candidates[0]?.deadline).toBeNull();
  });
});

describe("pickQueries & scoreCandidate", () => {
  it("menggilir kueri antar-run", () => {
    const q = ["a", "b", "c", "d", "e"];
    const day = 86_400_000;
    const first = pickQueries(q, 2, new Date(0), day);
    const second = pickQueries(q, 2, new Date(day), day);
    expect(first).toEqual(["a", "b"]);
    expect(second).toEqual(["c", "d"]);
  });

  it("skor lebih tinggi untuk tautan terverifikasi, WNI eksplisit, dan tenggat mendatang", () => {
    const strong = scoreCandidate({
      linkVerified: true,
      institutional: true,
      openToIndonesia: "yes",
      deadline: "2027-01-01",
      seenCount: 3,
      now,
    });
    const weak = scoreCandidate({
      linkVerified: false,
      institutional: false,
      openToIndonesia: "unknown",
      deadline: null,
      seenCount: 1,
      now,
    });
    expect(strong).toBe(100);
    expect(weak).toBe(20);
  });
});

describe("perbaikan dari uji nyata", () => {
  it("alias dalam kurung tidak membedakan nama", () => {
    expect(nameKey("MEXT Scholarship (Monbukagakusho)")).toBe(
      nameKey("MEXT Scholarship"),
    );
  });

  it("tautan ke situs agregator yang sama bukan tautan resmi", () => {
    const result = validateCandidates(
      {
        candidates: [
          {
            name: "Henan Government Scholarship",
            organizer: null,
            kind: "scholarship",
            country: "CN",
            levels: [],
            official_link: 1,
            open_to_indonesia: "unknown",
            deadline: null,
            summary:
              "Beasiswa pemerintah provinsi Henan untuk mahasiswa internasional.",
            evidence: "Henan Government Scholarship for international students",
          },
        ],
      },
      {
        text: "Henan Government Scholarship for international students is available.",
        links: [
          {
            text: "Read more",
            url: "https://gradualin.com/henan-scholarship/",
          },
        ],
        url: "https://gradualin.com/top-10/",
      },
      "scholarship",
      new Date("2026-10-06"),
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.candidates[0]?.officialUrl).toBeNull();
  });
});

describe("gabung kandidat mirip dalam satu run", () => {
  it("nama dengan tambahan singkatan atau URL resmi sama dianggap satu program", () => {
    const known = [
      {
        id: "a",
        title: "Chinese Government Scholarship",
        organizationName: null,
        officialUrl: "http://www.csc.edu.cn/",
        applyUrl: null,
      },
    ];
    expect(
      findDuplicate(
        { name: "Chinese Government Scholarship / CSC", officialUrl: null },
        known,
      )?.id,
    ).toBe("a");
    expect(
      findDuplicate(
        {
          name: "Chinese Embassy Scholarships",
          officialUrl: "http://www.csc.edu.cn/",
        },
        known,
      )?.id,
    ).toBe("a");
  });
});

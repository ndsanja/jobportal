export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type JsonCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function parseJsonLoose(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

/**
 * Memanggil model lewat OpenRouter dan memaksa keluaran JSON yang lolos `validate`.
 * Satu kali coba ulang (dengan umpan balik galat) bila keluaran bukan JSON/tidak lolos validasi.
 * Galat HTTP dilempar tanpa isi respons/URL agar tidak membocorkan apa pun.
 */
export async function callJsonModel<T>(
  messages: ChatMessage[],
  deps: {
    apiKey: string;
    model: string;
    fetch?: FetchLike;
    maxTokens?: number;
  },
  validate: (json: unknown) => JsonCallResult<T>,
): Promise<JsonCallResult<T>> {
  const doFetch = deps.fetch ?? fetch;
  const conversation = [...messages];
  let lastError = "Tidak ada respons";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await doFetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Karir Pro",
        },
        body: JSON.stringify({
          model: deps.model,
          messages: conversation,
          temperature: 0,
          max_tokens: deps.maxTokens ?? 3000,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok)
      throw new Error(`OpenRouter gagal: HTTP ${response.status}`);

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      lastError = "Respons model kosong";
      continue;
    }

    let json: unknown;
    try {
      json = parseJsonLoose(content);
    } catch {
      lastError = "Keluaran model bukan JSON";
      conversation.push(
        { role: "assistant", content },
        {
          role: "user",
          content:
            "Keluaran bukan JSON valid. Balas ulang hanya dengan objek JSON sesuai skema.",
        },
      );
      continue;
    }

    const checked = validate(json);
    if (checked.ok) return checked;
    lastError = checked.error;
    conversation.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `Skema tidak valid (${checked.error}). Perbaiki dan balas ulang hanya dengan JSON.`,
      },
    );
  }

  return { ok: false, error: lastError };
}

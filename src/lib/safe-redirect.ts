/** Hanya mengizinkan path internal (mencegah open redirect lewat ?next=). */
export function safeNextPath(
  value: string | null | undefined,
  fallback = "/saya",
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }
  return value;
}

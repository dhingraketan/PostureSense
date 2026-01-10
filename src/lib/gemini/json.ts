export function extractJson(text: string) {
  // 1) direct parse
  try { return JSON.parse(text); } catch {}

  // 2) best-effort slice between first { and last }
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i >= 0 && j > i) {
    return JSON.parse(text.slice(i, j + 1));
  }

  throw new Error("Gemini did not return valid JSON");
}

export function extractJson(text: string) {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // Try to find JSON block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = text.slice(start, end + 1);
    return JSON.parse(sliced);
  }

  throw new Error("Gemini did not return valid JSON");
}

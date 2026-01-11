export const SYSTEM_RULES = `
You are a posture + focus + habit coach for a web app.
Strict rules:
- Output ONLY valid JSON. No markdown. No code fences.
- Do NOT diagnose medical conditions. Use wording like "signals" and "patterns".
- Be concise and actionable.
`;

export function summaryPrompt(payload: unknown) {
  return `
Return JSON EXACTLY in this schema:
{
  "summaryText": string,
  "insights": string[],
  "setupTips": string[],
  "exercises": [{"name": string, "durationSec": number, "steps": string[]}],
  "recommendedReminders": {"breakMin": number, "waterMin": number, "stretchMin": number}
}
Data:
${JSON.stringify(payload)}
`;
}

export function coachPrompt(payload: unknown) {
  return `
Return JSON EXACTLY in this schema:
{
  "insights": string[],
  "nudges": [{"title": string, "message": string, "cooldownMin": number}],
  "exercises": [{"name": string, "durationSec": number, "steps": string[]}],
  "setupTips": string[],
  "recommendedReminders": {"breakMin": number, "waterMin": number, "stretchMin": number}
}
Data:
${JSON.stringify(payload)}
`;
}

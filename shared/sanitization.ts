const promptInjectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /system\s+(message|prompt)/i,
  /developer\s+(message|instructions?)/i,
  /reveal\s+(secrets?|tokens?|passwords?)/i,
  /execute\s+(sql|code|command)/i,
  /call\s+(the\s+)?(tool|action)/i,
]

export function detectPromptInjection(text: string): string[] {
  return promptInjectionPatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source)
}

export function sanitizeLogValue(value: unknown): string {
  if (value instanceof Error) return value.name
  return typeof value === 'string' ? value.replace(/[\w.+-]+@[\w.-]+/g, '[email]').slice(0, 120) : typeof value
}

export function maskSensitiveText(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi, '[IBAN_MASKED]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[CARD_MASKED]')
    .replace(/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi, '[TAX_ID_MASKED]')
    .replace(/\b(?:\+?39)?\s?\d{8,11}\b/g, '[PHONE_MASKED]')
}

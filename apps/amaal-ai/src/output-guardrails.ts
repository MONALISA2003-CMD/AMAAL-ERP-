export type AmaalAIOutputGuardrailCategory = 'SECRET'|'RAW_SQL'|'PRIVILEGED_COMMAND';

export type AmaalAIOutputGuardrailResult = {
  blocked: boolean;
  categories: AmaalAIOutputGuardrailCategory[];
  text: string;
};

const GENERIC_BLOCK_MESSAGE = 'Amaal AI withheld part of the response because it matched protected implementation material. I can provide the operational result or explain the business process without exposing secrets, raw database commands, or privileged bypass instructions.';

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,})\b/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{20,}\b/i,
  /\b(?:postgres|postgresql|redis|rediss):\/\/[^\s`]+/i,
  /\b(?:OPENAI_API_KEY|AMAAL_SETUP_KEY|DATABASE_URL|AMAAL_VALKEY_URL)\s*=\s*[^\s`]+/i,
];

const SQL_PATTERNS: readonly RegExp[] = [
  /(^|\n)\s*(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|drop\s+(?:table|database|schema)|alter\s+(?:table|role|user)|truncate(?:\s+table)?|grant|revoke)\b/i,
  /```(?:sql|postgres|postgresql|psql)?[\s\S]*?\b(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|drop\s+(?:table|database|schema)|alter\s+(?:table|role|user)|truncate|grant|revoke)\b[\s\S]*?```/i,
];

const PRIVILEGED_COMMAND_PATTERNS: readonly RegExp[] = [
  /\b(?:ignore|bypass)\s+(?:previous|all|the)?\s*(?:instructions|policy|authorization|approval|security)\b/i,
  /\b(?:disable\s+(?:a|the)?\s*user|change\s+(?:a|the)?\s*password|grant\s+admin|make\s+me\s+(?:ceo|admin)|elevate\s+privileges)\b/i,
];

function matched(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function guardAmaalAIOutput(text: string): AmaalAIOutputGuardrailResult {
  const value = text.trim();
  const categories: AmaalAIOutputGuardrailCategory[] = [];
  if (matched(SECRET_PATTERNS, value)) categories.push('SECRET');
  if (matched(SQL_PATTERNS, value)) categories.push('RAW_SQL');
  if (matched(PRIVILEGED_COMMAND_PATTERNS, value)) categories.push('PRIVILEGED_COMMAND');
  return categories.length
    ? { blocked: true, categories, text: GENERIC_BLOCK_MESSAGE }
    : { blocked: false, categories: [], text: value };
}

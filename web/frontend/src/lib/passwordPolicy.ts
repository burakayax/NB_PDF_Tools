/** Mirrors server rules for new passwords (register + change-password). */

export const NEW_PASSWORD_MIN_LENGTH = 10;
export const NEW_PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyIssue = { en: string; tr: string };

export function validateNewPasswordPolicy(password: string): { ok: boolean; issues: PasswordPolicyIssue[] } {
  const issues: PasswordPolicyIssue[] = [];
  if (password.length < NEW_PASSWORD_MIN_LENGTH) {
    issues.push({
      en: `At least ${NEW_PASSWORD_MIN_LENGTH} characters`,
      tr: `En az ${NEW_PASSWORD_MIN_LENGTH} karakter`,
    });
  }
  if (password.length > NEW_PASSWORD_MAX_LENGTH) {
    issues.push({
      en: `At most ${NEW_PASSWORD_MAX_LENGTH} characters`,
      tr: `En fazla ${NEW_PASSWORD_MAX_LENGTH} karakter`,
    });
  }
  if (!/[a-z]/.test(password)) {
    issues.push({ en: "One lowercase letter", tr: "Bir küçük harf" });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({ en: "One uppercase letter", tr: "Bir büyük harf" });
  }
  if (!/\d/.test(password)) {
    issues.push({ en: "One number", tr: "Bir rakam" });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push({ en: "One symbol (e.g. !@#$%)", tr: "Bir sembol (örn. !@#$%)" });
  }
  return { ok: issues.length === 0, issues };
}

/** 0–5 satisfied rules (length + 4 character classes). */
export function newPasswordStrengthScore(password: string): number {
  let n = 0;
  if (password.length >= NEW_PASSWORD_MIN_LENGTH) {
    n += 1;
  }
  if (/[a-z]/.test(password)) {
    n += 1;
  }
  if (/[A-Z]/.test(password)) {
    n += 1;
  }
  if (/\d/.test(password)) {
    n += 1;
  }
  if (/[^A-Za-z0-9]/.test(password)) {
    n += 1;
  }
  return n;
}

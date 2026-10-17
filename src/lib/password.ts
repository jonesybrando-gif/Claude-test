/** Password rules: at least 10 characters, not only letters or only digits, not the email. */
export function passwordProblems(password: string, email?: string): string[] {
  const p: string[] = [];
  if (password.length < 10) p.push("Use at least 10 characters.");
  if (password.length > 200) p.push("Use at most 200 characters.");
  if (/^[a-zA-Z]+$/.test(password) || /^\d+$/.test(password)) p.push("Mix letters with numbers or symbols.");
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) p.push("Don't include your email name.");
  return p;
}

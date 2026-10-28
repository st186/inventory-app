// Password strength rules for the live checklist on the change-password screen.
// The server enforces the same rules (supabase/functions/make-server-c2dd9b9d/passwords.ts,
// passwordProblems) - keep the two in sync. Showing them here only saves a round trip; the
// server's answer is what counts.

export const PASSWORD_MIN_LENGTH = 10;
// bcrypt (Supabase Auth) only reads the first 72 bytes.
export const PASSWORD_MAX_BYTES = 72;
export const COMMON_PASSWORD_WORDS = ['bunny', 'momo', 'bhandar', 'password', '1234', 'qwerty'];

export interface PasswordRule {
  id: 'length' | 'letterDigit' | 'maxBytes' | 'personal' | 'common';
  ok: boolean;
  en: string;
  bn: string;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBengaliDigits = (n: number | string) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

// Same normalising as the server: letters and digits only, plus look-alike swaps undone
// ("p@ssw0rd" -> "password").
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const unswap = (s: string) => s.toLowerCase()
  .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
const containsWord = (pw: string, word: string) =>
  squash(pw).includes(squash(word)) || squash(unswap(pw)).includes(squash(unswap(word)));

export interface PasswordPerson {
  name?: string | null;
  employeeId?: string | null;
  email?: string | null;
}

// Name and email parts need 4+ letters, so short surnames ("Das", "Sen") don't ban everyday words.
function personalWords(person: PasswordPerson): string[] {
  const words = new Set<string>();
  const name = (person.name || '').toLowerCase();
  const local = (person.email || '').toLowerCase().split('@')[0];
  for (const part of [...name.split(/[^a-z]+/), ...local.split(/[^a-z]+/)]) if (part.length >= 4) words.add(part);
  for (const whole of [squash(name), squash(local), squash(person.employeeId || '')]) if (whole.length >= 3) words.add(whole);
  return [...words];
}

export function passwordChecklist(pw: string, person: PasswordPerson): PasswordRule[] {
  const bytes = new TextEncoder().encode(pw).length;
  return [
    {
      id: 'length',
      ok: [...pw].length >= PASSWORD_MIN_LENGTH,
      en: `At least ${PASSWORD_MIN_LENGTH} characters`,
      bn: `কমপক্ষে ${toBengaliDigits(PASSWORD_MIN_LENGTH)}টি অক্ষর`,
    },
    {
      id: 'letterDigit',
      ok: /[A-Za-z]/.test(pw) && /[0-9]/.test(pw),
      en: 'Letters (A-Z) and numbers (0-9)',
      bn: 'ইংরেজি অক্ষর (A-Z) আর সংখ্যা (0-9) দুটোই',
    },
    {
      id: 'maxBytes',
      ok: bytes > 0 && bytes <= PASSWORD_MAX_BYTES,
      en: `Not more than ${PASSWORD_MAX_BYTES} characters`,
      bn: `${toBengaliDigits(PASSWORD_MAX_BYTES)}টি অক্ষরের বেশি নয়`,
    },
    {
      id: 'personal',
      ok: pw.length > 0 && !personalWords(person).some((w) => containsWord(pw, w)),
      en: 'No name, staff ID or email in it',
      bn: 'নিজের নাম, স্টাফ আইডি বা ইমেল নেই',
    },
    {
      id: 'common',
      ok: pw.length > 0 && !COMMON_PASSWORD_WORDS.some((w) => containsWord(pw, w)),
      en: 'No easy words: bunny, momo, bhandar, password, 1234, qwerty',
      bn: 'সহজ শব্দ নেই: bunny, momo, bhandar, password, 1234, qwerty',
    },
  ];
}

// The language the app's own words are shown in (menus, buttons, status words) - utils/i18n.ts
// reads it. Separate from Bunny's language (utils/bunnyLanguage.ts: voice input, AI answers and
// read-aloud), so a manager can read the app in English and still speak to Bunny in Bengali
// (owner, 27 Oct 2026). Both are chosen in the Account sheet and remembered per person on this
// phone or browser.
//
// Never chosen: English for owner and manager logins, Bengali for staff and rider logins.
import { useEffect, useState } from 'react';

export type AppLanguage = 'en' | 'bn' | 'hi';

export const APP_LANGUAGES: { id: AppLanguage; label: string }[] = [
  { id: 'bn', label: 'বাংলা' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

type PersonLike = { role?: string | null; designation?: string | null };

let owner = 'anyone';
let fallback: AppLanguage = 'en';
const listeners = new Set<(lang: AppLanguage) => void>();
const storageKey = () => `appLanguage:${owner}`;
// The last language used on this phone, so the sign-in page opens in it.
const LAST_KEY = 'appLanguage:last';

const isLang = (value: unknown): value is AppLanguage => value === 'en' || value === 'bn' || value === 'hi';

/** The language a person sees before they choose one. */
export function defaultAppLanguage(person: PersonLike | null | undefined): AppLanguage {
  if (!person) return 'en';
  if (person.designation === 'rider') return 'bn';
  if (person.role === 'employee') return 'bn';
  return 'en';
}

// Called once the signed-in person is known (and with null after sign-out), so two people sharing
// a phone keep their own choice.
export function setAppLanguageOwner(userId: string | null | undefined, person?: PersonLike | null) {
  owner = userId || 'anyone';
  fallback = userId ? defaultAppLanguage(person) : 'en';
  const lang = getAppLanguage();
  listeners.forEach((fn) => fn(lang));
}

export function getAppLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(storageKey());
    if (isLang(saved)) return saved;
    if (owner === 'anyone') {
      const last = localStorage.getItem(LAST_KEY);
      if (isLang(last)) return last;
    }
  } catch {
    /* storage blocked: the default */
  }
  return fallback;
}

export function setAppLanguage(lang: AppLanguage) {
  try {
    localStorage.setItem(storageKey(), lang);
    localStorage.setItem(LAST_KEY, lang);
  } catch {
    /* kept for this session only */
  }
  listeners.forEach((fn) => fn(lang));
}

/** Follows changes to the language (and to who is signed in). */
export function subscribeAppLanguage(fn: (lang: AppLanguage) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAppLanguage(): [AppLanguage, (lang: AppLanguage) => void] {
  const [lang, setLang] = useState<AppLanguage>(getAppLanguage);
  useEffect(() => {
    setLang(getAppLanguage());
    return subscribeAppLanguage(setLang);
  }, []);
  return [lang, setAppLanguage];
}

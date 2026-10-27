// The language Bunny uses with each person: what the mic listens for, the language of AI answers
// and the voice that reads them aloud. Chosen on the Home screen; remembered per person on
// this phone or browser.
import { useEffect, useState } from 'react';

export type BunnyLanguage = 'en' | 'bn' | 'hi';

export const BUNNY_LANGUAGES: { id: BunnyLanguage; label: string; speech: 'en-IN' | 'bn-IN' | 'hi-IN' }[] = [
  { id: 'bn', label: 'বাংলা', speech: 'bn-IN' },
  { id: 'en', label: 'English', speech: 'en-IN' },
  { id: 'hi', label: 'हिन्दी', speech: 'hi-IN' },
];

let owner = 'anyone';
const listeners = new Set<(lang: BunnyLanguage) => void>();
const storageKey = () => `bunnyLanguage:${owner}`;

// Called once the signed-in person is known, so two people sharing a phone keep their own choice.
export function setLanguageOwner(userId: string | null | undefined) {
  owner = userId || 'anyone';
  const lang = getBunnyLanguage();
  listeners.forEach((fn) => fn(lang));
}

// Whose phone storage this is (the signed-in person), for other per-person settings like chat history.
export const languageOwner = () => owner;

export function getBunnyLanguage(): BunnyLanguage {
  try {
    const saved = localStorage.getItem(storageKey()) || localStorage.getItem('voiceLanguage');
    if (saved === 'en' || saved === 'en-IN') return 'en';
    if (saved === 'hi' || saved === 'hi-IN') return 'hi';
  } catch { /* storage blocked - fall back to Bengali */ }
  return 'bn';
}

export function setBunnyLanguage(lang: BunnyLanguage) {
  try { localStorage.setItem(storageKey(), lang); } catch { /* kept for this session only */ }
  listeners.forEach((fn) => fn(lang));
}

export const speechLocale = (lang: BunnyLanguage) => BUNNY_LANGUAGES.find((l) => l.id === lang)!.speech;

export function useBunnyLanguage(): [BunnyLanguage, (lang: BunnyLanguage) => void] {
  const [lang, setLang] = useState<BunnyLanguage>(getBunnyLanguage);
  useEffect(() => {
    listeners.add(setLang);
    return () => { listeners.delete(setLang); };
  }, []);
  return [lang, setBunnyLanguage];
}

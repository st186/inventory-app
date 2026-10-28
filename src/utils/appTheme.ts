// Light or dark (owner, 28 Oct 2026: "night mode ... toggle choice dark or light"), chosen in the
// Account sheet and remembered on this phone or browser. "Same as phone" follows the phone's own
// setting and changes with it. The colours are the tokens in styles/globals.css; the dark ones sit
// under [data-theme="dark"], set here on <html>. Light until someone chooses otherwise.
import { useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'appTheme';
const listeners = new Set<(choice: ThemeChoice) => void>();
const isChoice = (v: unknown): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system';
const phoneDark = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemeChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (isChoice(saved)) return saved;
  } catch {
    /* storage blocked: light */
  }
  return 'light';
}

export function shownTheme(choice: ThemeChoice = getThemeChoice()): 'light' | 'dark' {
  return choice === 'system' ? (phoneDark()?.matches ? 'dark' : 'light') : choice;
}

function applyTheme() {
  const theme = shownTheme();
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // The browser's bar colour: the surface colour of the theme now showing.
  const surface = getComputedStyle(root).getPropertyValue('--surface').trim();
  if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
}

export function setThemeChoice(choice: ThemeChoice) {
  try { localStorage.setItem(KEY, choice); } catch { /* this session only */ }
  applyTheme();
  listeners.forEach((fn) => fn(choice));
}

// Once at start-up, before the first screen: the saved theme, and the phone's changes followed.
export function startTheme() {
  applyTheme();
  phoneDark()?.addEventListener?.('change', () => { if (getThemeChoice() === 'system') applyTheme(); });
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice);
  useEffect(() => {
    listeners.add(setChoice);
    return () => { listeners.delete(setChoice); };
  }, []);
  return [choice, setThemeChoice];
}

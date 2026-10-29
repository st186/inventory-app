// Learn the app (owner, 29 Oct 2026: "the tour is very generic ... it needs to be detailed enough"):
// each role's work in short chapters the person does with their own fingers. Chapter 1 (finding
// your way) runs on the real app - it only opens screens. The rest run in practice mode: the same
// screens on made-up data, where every button can be pressed and nothing reaches the server
// (PracticeApp.tsx, started from main.tsx). Which chapters are done is kept on the phone per login.
import type { NavModel } from '../shell/navConfig';

export type Two = { en: string; bn: string };
export const two = (en: string, bn: string): Two => ({ en, bn });

/** A practice run: whose made-up app to show, which chapter, and where to go back to. */
export type PracticeSession = { persona: string; chapter: string; name: string; who: string; back: string };

const SESSION_KEY = 'bunny-practice';
const doneKey = (who: string) => `bunny-learn:v1:${who}`;
type PracticeGlobal = { __BUNNY_PRACTICE__?: PracticeSession };

/** main.tsx: the practice run this tab was reloaded into, if any. */
export function readPracticeSession(): PracticeSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as PracticeSession) : null;
    return s && s.persona && s.chapter ? s : null;
  } catch {
    return null;
  }
}

/** The practice run on screen now (null in the real app). */
export function practiceSession(): PracticeSession | null {
  return (globalThis as PracticeGlobal).__BUNNY_PRACTICE__ || null;
}

/** Leave the real app for a practice chapter (the page reloads into PracticeApp). */
export function startPractice(s: Omit<PracticeSession, 'back'> & { back?: string }) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, back: s.back ?? (window.location.hash || '#/') }));
  } catch {
    return;
  }
  window.location.hash = '#/';
  window.location.reload();
}

/** Back to the real app, where the person was before practice. */
export function leavePractice() {
  const back = practiceSession()?.back || '#/';
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* storage off */ }
  window.location.hash = back;
  window.location.reload();
}

export function chaptersDone(who: string): string[] {
  try {
    const raw = window.localStorage.getItem(doneKey(who));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markChapterDone(who: string, id: string) {
  const done = chaptersDone(who);
  if (done.includes(id)) return;
  try { window.localStorage.setItem(doneKey(who), JSON.stringify([...done, id])); } catch { /* storage off */ }
}

/** The screens' language in practice: the crew and riders use the app in Bengali (owner, 29 Oct
 *  2026); managers practise on the English screens the guides show. */
export const practiceLang = (persona: string): 'en' | 'bn' => (['store-crew', 'kitchen-crew', 'rider'].includes(persona) ? 'bn' : 'en');

/** Which role's lessons and practice data fit this login. */
export function learnPersona(nav: NavModel, designation?: string | null): string {
  switch (nav.kind) {
    case 'store-incharge': return 'store-incharge';
    case 'production-incharge': return 'production-incharge';
    case 'ops': return 'operations';
    case 'owner': return 'owner';
    case 'rider': return 'rider';
    default: return designation === 'production_ops' ? 'kitchen-crew' : 'store-crew';
  }
}

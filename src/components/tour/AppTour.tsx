// The app tour (owner, 29 Oct 2026): on someone's first open it walks them round their own app -
// Home's cards, each tab, the top bar - in English and Bengali; More/Me › App tour plays it again.
// "Seen" is kept on the phone per login, so it shows once per person per device.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../utils/i18n';
import { CoachMarks, firstVisible, type CoachStep } from '../ui/coach-marks';
import { useShell } from '../shell/ShellContext';
import { tourSteps, type Two } from './tourSteps';

const START = 'bunny:tour';
/** Plays the tour (More/Me › App tour). */
export function startAppTour() {
  window.dispatchEvent(new Event(START));
}

const seenKey = (who: string) => `bunny-tour:v1:${who}`;
// The dev previews (*-preview.html) never start it on their own.
const autoOff = () => /-preview\.html$/.test(window.location.pathname);

function Title({ text }: { text: Two }) {
  return (
    <>
      <span lang="en">{text.en}</span>
      <span lang="bn" className="text-body-md font-semibold text-text-2">{text.bn}</span>
    </>
  );
}
function Body({ text }: { text: Two }) {
  return (
    <>
      <p lang="en" className="text-text">{text.en}</p>
      <p lang="bn">{text.bn}</p>
    </>
  );
}

export function AppTour() {
  const { nav, router, user, preview } = useShell();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<CoachStep[]>([]);
  const who = user.employeeId || user.email || 'me';
  const routerRef = useRef(router);
  routerRef.current = router;

  const all: CoachStep[] = useMemo(() => tourSteps(nav).map((s) => ({
    id: s.id,
    optional: s.optional,
    target: s.selector ? () => firstVisible(s.selector!) : undefined,
    title: <Title text={s.title} />,
    body: <Body text={s.body} />,
  })), [nav]);

  // The tour starts on Home once its cards are on screen, with only the parts this person has
  // (so the count reads "3 of 13", not "3 of 16" with steps skipped).
  const begin = useCallback(() => {
    if (routerRef.current.route.path !== 'home') routerRef.current.go('home');
    window.setTimeout(() => {
      setSteps(all.filter((s) => !s.optional || !s.target || s.target()));
      setOpen(true);
    }, 1000);
  }, [all]);

  useEffect(() => {
    const on = () => begin();
    window.addEventListener(START, on);
    return () => window.removeEventListener(START, on);
  }, [begin]);

  // First open: once per person on this phone.
  useEffect(() => {
    if (preview || autoOff()) return;
    let seen = true;
    try { seen = !!window.localStorage.getItem(seenKey(who)); } catch { /* storage off: don't nag */ }
    if (seen) return;
    // Only when the app opened on Home: someone who came in from a notification is left to it,
    // and gets the tour on a later open.
    const timer = window.setTimeout(() => { if (routerRef.current.route.path === 'home') begin(); }, 1800);
    return () => window.clearTimeout(timer);
  }, [preview, who, begin]);

  const close = useCallback(() => {
    setOpen(false);
    try { window.localStorage.setItem(seenKey(who), new Date().toISOString()); } catch { /* storage off */ }
  }, [who]);

  return (
    <CoachMarks
      open={open}
      steps={steps}
      onClose={close}
      labels={{ next: t('tour.next'), back: t('tour.back'), skip: t('tour.skip'), done: t('tour.done'), step: (i, n) => t('tour.step', { n: i, total: n }) }}
    />
  );
}

/** More/Me › App tour opened as a page (a link or the desktop sidebar): play the tour. */
export function AppTourLauncher() {
  useEffect(() => { startAppTour(); }, []);
  return null;
}

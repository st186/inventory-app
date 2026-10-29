// Runs Learn the app's chapters (chapters.ts) over the screens, mounted once in the shell in place
// of the plain app tour. On someone's first open it plays chapter 1 on the real app; a practice
// chapter reloads the page into practice mode (learn.ts), where it starts by itself. After each
// chapter a card offers the next one.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '../shell/ShellContext';
import { useT } from '../../utils/i18n';
import { CoachMarks, type CoachStep } from '../ui/coach-marks';
import { AppTour, Body, Title, autoOff, seenKey } from '../tour/AppTour';
import { chaptersFor, type Chapter } from './chapters';
import { chaptersDone, learnPersona, leavePractice, markChapterDone, practiceSession, startPractice, two } from './learn';

const START = 'bunny:lesson';
/** Plays a chapter (Learn the app, the Home card). */
export function startLesson(id: string) {
  window.dispatchEvent(new CustomEvent(START, { detail: id }));
}

// Sheets close on Escape; the lesson sends one before a step that needs the screen clear.
const closeSheets = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

const TAP = <Title text={two('Tap the lit-up part', 'আলো জ্বলা জায়গায় চাপুন')} />;

export function LearnHost() {
  const { nav, router, user, preview } = useShell();
  const { t } = useT();
  const practice = practiceSession();
  const persona = practice?.persona || learnPersona(nav, user.designation);
  const chapters = chaptersFor(persona);
  const who = practice?.who || user.employeeId || user.email || 'me';
  const [running, setRunning] = useState<Chapter | null>(null);
  const [finished, setFinished] = useState<Chapter | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;
  const started = useRef(false);

  const begin = useCallback((id: string) => {
    const c = chapters?.find((x) => x.id === id);
    if (!c) return;
    // Practice chapters start from fresh made-up data: a reload into practice mode (the first
    // one in a practice run is already fresh).
    if (c.practice && (!practice || started.current || practice.chapter !== id)) {
      startPractice({ persona, chapter: id, name: practice?.name || user.name, who, back: practice?.back });
      return;
    }
    started.current = true;
    setFinished(null);
    setRunning(null);
    routerRef.current.go('home');
    window.setTimeout(() => setRunning(c), 900);
  }, [chapters, practice, persona, user.name, who]);

  useEffect(() => {
    const on = (e: Event) => begin((e as CustomEvent<string>).detail);
    window.addEventListener(START, on);
    return () => window.removeEventListener(START, on);
  }, [begin]);

  // Practice: the chapter it was opened for starts once the screen is up.
  useEffect(() => {
    if (!practice) return;
    const timer = window.setTimeout(() => begin(practice.chapter), 1200);
    return () => window.clearTimeout(timer);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First open: chapter 1, once per person on this phone, when the app opened on Home.
  useEffect(() => {
    if (practice || !chapters || preview || autoOff()) return;
    let seen = true;
    try { seen = !!window.localStorage.getItem(seenKey(who)); } catch { /* storage off: don't nag */ }
    if (seen) return;
    const timer = window.setTimeout(() => {
      if (routerRef.current.route.path !== 'home') return;
      try { window.localStorage.setItem(seenKey(who), new Date().toISOString()); } catch { /* storage off */ }
      begin(chapters[0].id);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [practice, chapters, preview, who, begin]);

  const steps: CoachStep[] = useMemo(() => (running ? running.steps.map((s) => ({
    id: s.id,
    target: s.find,
    optional: s.optional,
    act: s.act,
    ready: s.ready,
    wait: s.wait ?? (s.find ? 6000 : 0),
    before: s.go || s.close ? () => {
      if (s.close) closeSheets();
      if (s.go && routerRef.current.route.path !== s.go) routerRef.current.go(s.go);
    } : undefined,
    title: <Title text={s.title} />,
    body: <Body text={s.body} />,
  })) : []), [running]);

  const onLessonClose = useCallback((done: boolean) => {
    const c = running;
    setRunning(null);
    if (!c) return;
    if (done) {
      markChapterDone(who, c.id);
      setFinished(c);
    } else if (practice) leavePractice();
  }, [running, who, practice]);

  // The card after a chapter: what's next.
  const next = finished && chapters ? chapters[chapters.indexOf(finished) + 1] : undefined;
  const doneCount = finished && chapters ? chapters.filter((c) => chaptersDone(who).includes(c.id)).length : 0;
  const finishSteps: CoachStep[] = finished && chapters ? [{
    id: 'finished',
    title: <Title text={two(`Done: ${finished.title.en}`, `শেষ: ${finished.title.bn}`)} />,
    body: <Body text={next
      ? two(`Next: ${next.title.en}. ${next.about.en}`, `পরের: ${next.title.bn}। ${next.about.bn}`)
      : two('You have done every chapter. Practise again any time from Learn the app.', 'সব অধ্যায় শেষ। Learn the app থেকে যখন খুশি আবার অভ্যাস করুন।')} />,
  }] : [];
  const onFinishClose = useCallback((go: boolean) => {
    setFinished(null);
    if (go && next) begin(next.id);
    else if (practice) leavePractice();
  }, [next, begin, practice]);

  if (!chapters) return <AppTour />;
  return (
    <>
      <AppTour auto={false} />
      <CoachMarks
        open={!!running}
        steps={steps}
        onClose={onLessonClose}
        noBack
        labels={{ next: t('tour.next'), back: t('tour.back'), skip: practice ? t('learn.leave') : t('tour.skip'), done: t('tour.done'), step: (i, n) => t('tour.step', { n: i, total: n }), tap: TAP }}
      />
      <CoachMarks
        open={!!finished}
        steps={finishSteps}
        onClose={onFinishClose}
        noBack
        labels={{
          next: next ? t('learn.next') : t('learn.finish'), done: next ? t('learn.next') : t('learn.finish'), back: '',
          skip: practice ? t('learn.leave') : t('learn.later'), step: () => t('learn.done', { n: doneCount, total: chapters.length }),
        }}
      />
    </>
  );
}

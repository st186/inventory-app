// More / Me › Learn the app: this role's chapters with a tick for each one done, and the
// one-minute tour. On Home, LearnCard shows how far they've got until every chapter is done.
import { useEffect, useState } from 'react';
import { CheckCircle2, GraduationCap, MousePointerClick } from 'lucide-react';
import { useShell, useShellMaybe } from '../shell/ShellContext';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { ListGroup, ListRow } from '../ui/list-row';
import { startAppTour } from '../tour/AppTour';
import { chaptersFor } from './chapters';
import { chaptersDone, learnPersona, practiceSession } from './learn';
import { startLesson } from './LearnHost';

function useLearn() {
  const { nav, user } = useShell();
  const practice = practiceSession();
  const chapters = chaptersFor(practice?.persona || learnPersona(nav, user.designation));
  const who = practice?.who || user.employeeId || user.email || 'me';
  const [done, setDone] = useState(() => chaptersDone(who));
  // A chapter finished while this is on screen.
  useEffect(() => {
    const timer = window.setInterval(() => setDone(chaptersDone(who)), 2000);
    return () => window.clearInterval(timer);
  }, [who]);
  return { chapters, done };
}

export function LearnScreen() {
  const { t, lang } = useT();
  const { chapters, done } = useLearn();
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">
      {chapters && (
        <>
          <p className="text-body-sm text-text-2">{t('learn.intro')}</p>
          <ListGroup overline={t('learn.done', { n: chapters.filter((c) => done.includes(c.id)).length, total: chapters.length })}>
            {chapters.map((c, i) => {
              const isDone = done.includes(c.id);
              return (
                <ListRow
                  key={c.id}
                  leading={<span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-body-sm font-semibold text-text-2">{i + 1}</span>}
                  title={<span className="flex flex-col"><span lang="en">{c.title.en}</span><span lang="bn" className="text-body-sm font-normal text-text-2">{c.title.bn}</span></span>}
                  subtitle={`${lang === 'bn' ? c.about.bn : c.about.en} · ${t('learn.min', { n: c.minutes })}`}
                  trailing={isDone
                    ? <Button variant="ghost" size="sm" leadingIcon={<CheckCircle2 className="text-success" />} onClick={() => startLesson(c.id)}>{t('learn.again')}</Button>
                    : <Button variant="secondary" size="sm" onClick={() => startLesson(c.id)}>{t('learn.start')}</Button>}
                />
              );
            })}
          </ListGroup>
        </>
      )}
      <ListGroup>
        <ListRow icon={MousePointerClick} iconTone="neutral" title={t('learn.quick')} subtitle={t('learn.quickBody')} onClick={() => startAppTour()} />
      </ListGroup>
    </div>
  );
}

/** Home: how far they've got, and the next chapter, until every chapter is done. */
export function LearnCard() {
  return useShellMaybe() ? <LearnCardInShell /> : null;
}

function LearnCardInShell() {
  const { t, lang } = useT();
  const { chapters, done } = useLearn();
  if (!chapters || practiceSession()) return null;
  const next = chapters.find((c) => !done.includes(c.id));
  if (!next) return null;
  const count = chapters.filter((c) => done.includes(c.id)).length;
  return (
    <ListGroup>
      <ListRow
        icon={GraduationCap}
        iconTone="primary"
        title={`${t('learn.card')} · ${t('learn.done', { n: count, total: chapters.length })}`}
        subtitle={t('learn.cardNext', { title: lang === 'bn' ? next.title.bn : next.title.en, n: next.minutes })}
        trailing={<Button variant="secondary" size="sm" onClick={() => startLesson(next.id)}>{count ? t('learn.continue') : t('learn.start')}</Button>}
      />
    </ListGroup>
  );
}

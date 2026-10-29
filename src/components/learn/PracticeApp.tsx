// Practice mode (learn.ts): the person's own role's screens on made-up data, opened by main.tsx
// instead of the real app when the tab was reloaded into a practice chapter. Every server call is
// answered on the phone (gallery/guidePreview/mock.ts) and nothing is sent; a strip at the top
// says so, with Exit back to the real app.
import { installGuideMock } from '../../gallery/guidePreview/mock';
import { FlaskConical } from 'lucide-react';
import { PreviewShell } from '../../gallery/guidePreview/PreviewShell';
import { useT } from '../../utils/i18n';
import { leavePractice, type PracticeSession } from './learn';

installGuideMock();

function PracticeBanner() {
  const { t } = useT();
  return (
    <div className="flex items-center gap-3 border-b border-warning-border bg-warning-soft py-1 pr-1 pl-4 text-body-sm text-text" role="status">
      <FlaskConical className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1 py-2">{t('learn.practice')}</span>
      <button
        type="button"
        onClick={leavePractice}
        className="min-h-11 shrink-0 rounded-full px-4 text-body-sm font-semibold text-text hover:bg-warning-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('learn.exit')}
      </button>
    </div>
  );
}

export default function PracticeApp({ session }: { session: PracticeSession }) {
  // The guides' screens are in English with the lesson cards in both languages (owner, 29 Oct
  // 2026); the store incharge's lessons find buttons by their English words.
  return <PreviewShell personaId={session.persona} lang="en" name={session.name} banner={<PracticeBanner />} />;
}

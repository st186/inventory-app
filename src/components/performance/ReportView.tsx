// One performance note as the person reads it: who wrote it, the average, each checklist point with
// its 1-5 score (English and Bengali), and the personal note (server performance.ts).
import { useT } from '../../utils/i18n';
import { cn } from '../ui/utils';
import type { Report } from './perfApi';

export function ScoreDots({ score, label }: { score: number; label?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1" role="img" aria-label={label || `${score} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={cn('size-2.5 rounded-full', n <= score ? 'bg-primary' : 'bg-surface-3 ring-1 ring-inset ring-border')} />
      ))}
    </span>
  );
}

export function ReportView({ report }: { report: Report }) {
  const { t } = useT();
  const from = report.kind === 'owner' ? t('perf.fromOwner') : t('perf.fromManager', { name: report.writerName });
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={from}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body-md font-semibold text-text">{from}</h3>
        <span className="num text-body-sm font-semibold text-primary">{t('perf.average', { n: report.average })}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {report.items.map((i) => (
          <li key={i.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-body-sm text-text">{i.label}</span>
              {i.labelBn && <span lang="bn" className="text-caption text-text-3">{i.labelBn}</span>}
            </span>
            <ScoreDots score={i.score} label={`${i.label}: ${i.score} / 5`} />
          </li>
        ))}
      </ul>
      <p className="whitespace-pre-line rounded-md bg-surface-2 px-3 py-2 text-body-sm text-text">{report.note}</p>
    </section>
  );
}

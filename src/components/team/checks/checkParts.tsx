// Status and AI-hygiene chips for Workplace checks, in the person's App language (one language at
// a time). The rules behind them stay in workplace/workplaceUtils.ts.
import { AlertTriangle, Check, Clock, Sparkles, XCircle } from 'lucide-react';
import { StatusChip, type StatusTone } from '../../ui/status-chip';
import { useT, type I18nKey } from '../../../utils/i18n';
import { fmt12 } from '../../workplace/workplaceUtils';
import type { CheckStatus, PhotoView } from '../../workplace/workplaceApi';

export function CheckStatusChip({ status, start, end, short = false }: { status: CheckStatus; start: string; end: string; short?: boolean }) {
  const { t } = useT();
  switch (status) {
    case 'done':
      return <StatusChip tone="success" icon={Check}>{t('team.check.done')}</StatusChip>;
    case 'done_late':
      return <StatusChip tone="warning" icon={Check}>{t('team.check.doneLate')}</StatusChip>;
    case 'due':
      return <StatusChip tone="warning" icon={Clock}>{short ? t('team.check.dueShort') : t('team.check.dueBy', { time: fmt12(end) })}</StatusChip>;
    case 'late':
      return <StatusChip tone="danger" icon={AlertTriangle}>{short ? t('team.check.lateShort') : t('team.check.late')}</StatusChip>;
    case 'missed':
      return <StatusChip tone="danger" icon={XCircle}>{t('team.check.missed')}</StatusChip>;
    default:
      return <StatusChip tone="neutral">{start ? t('team.check.opens', { time: fmt12(start) }) : t('team.check.later')}</StatusChip>;
  }
}

/** AI score tone: green at or above the auto-flag score (+2), then amber, then red. */
export function scoreTone(score: number, threshold: number): StatusTone {
  if (score >= threshold) return 'success';
  if (score >= threshold - 2) return 'warning';
  return 'danger';
}

/** "AI 8/10" hygiene chip, or "Unclear photo" / "Not scored". */
export function HygieneChip({ photo, threshold }: { photo: Pick<PhotoView, 'aiStatus' | 'aiScore' | 'aiVerdict'>; threshold: number }) {
  const { t } = useT();
  if (photo.aiStatus === 'failed') return <StatusChip tone="neutral">{t('team.check.notScored')}</StatusChip>;
  if (photo.aiStatus !== 'scored' || typeof photo.aiScore !== 'number') return null;
  if (photo.aiVerdict === 'unclear_photo') return <StatusChip tone="neutral" icon={Sparkles}>{t('team.check.unclear')}</StatusChip>;
  return (
    <StatusChip tone={scoreTone(photo.aiScore, threshold)} icon={Sparkles}>
      <span className="num">{t('team.check.score', { n: photo.aiScore })}</span>
    </StatusChip>
  );
}

export const checkName = (item: { name: string; nameBn?: string }, lang: string) => (lang === 'bn' && item.nameBn ? item.nameBn : item.name);
export const issuesFor = (item: Pick<PhotoView, 'aiIssues' | 'aiIssuesBengali'>, lang: string) =>
  lang === 'bn' && item.aiIssuesBengali?.length ? item.aiIssuesBengali : item.aiIssues || [];

export const VERDICT_KEYS: Record<string, I18nKey> = {
  clean: 'team.check.verdictClean',
  needs_cleaning: 'team.check.verdictDirty',
  unclear_photo: 'team.check.verdictUnclear',
};

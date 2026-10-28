import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type * as api from '../../utils/api';
import { useT } from '../../utils/i18n';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { ErrorState } from '../ui/error-state';
import { SkeletonText } from '../ui/skeleton';
import { ResponsiveModal } from '../ui/responsive-modal';
import { cn } from '../ui/utils';
import { useHomeData } from '../home/homeData';

const HEADINGS = ['yesterday', 'this week', 'do today', 'watch'];

type BriefLine = { kind: 'heading' | 'bullet' | 'text'; text: string };

/** The brief's plain-text headings and bullet lines. */
function parseBrief(text: string): BriefLine[] {
  const out: BriefLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\*\*/g, '').trim();
    if (!line) continue;
    const bare = line.replace(/^#+\s*/, '').replace(/:$/, '');
    if (HEADINGS.includes(bare.toLowerCase())) { out.push({ kind: 'heading', text: bare }); continue; }
    const bullet = line.match(/^[-•*]\s+(.*)$/);
    out.push(bullet ? { kind: 'bullet', text: bullet[1] } : { kind: 'text', text: line });
  }
  return out;
}

/** Up to three bullets from "Do today" (else the first bullets of the brief). */
export function briefHighlights(text: string, max = 3): string[] {
  const lines = parseBrief(text);
  const start = lines.findIndex((l) => l.kind === 'heading' && l.text.toLowerCase() === 'do today');
  if (start >= 0) {
    const picked: string[] = [];
    for (const l of lines.slice(start + 1)) {
      if (l.kind === 'heading') break;
      if (l.kind === 'bullet') picked.push(l.text);
    }
    if (picked.length) return picked.slice(0, max);
  }
  const bullets = lines.filter((l) => l.kind === 'bullet').map((l) => l.text);
  return (bullets.length ? bullets : lines.filter((l) => l.kind === 'text').map((l) => l.text)).slice(0, max);
}

function BriefText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-body-sm text-text">
      {parseBrief(text).map((line, i) =>
        line.kind === 'heading' ? (
          <p key={i} className="overline-label pt-3 first:pt-0">{line.text}</p>
        ) : line.kind === 'bullet' ? (
          <p key={i} className="relative pl-4 before:absolute before:left-1 before:text-text-3 before:content-['•']">{line.text}</p>
        ) : (
          <p key={i}>{line.text}</p>
        ),
      )}
    </div>
  );
}

const timeOfBrief = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

// Today's brief, written by Claude once a day from the forecast, yesterday's result, the
// festival calendar, wastage and stock-outs. `compact` (Home): three bullets from "Do today",
// "Read full brief" and "Ask Bunny"; otherwise the whole brief (Insights).
export function DailyBriefCard({ accessToken, storeId, canManage, compact = false, onAskBunny }: {
  accessToken: string;
  storeId: string | null;
  canManage: boolean;
  compact?: boolean;
  onAskBunny?: () => void;
}) {
  const { t } = useT();
  const data = useHomeData();
  const [brief, setBrief] = useState<api.AiBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    data.getAiBrief(accessToken, storeId, false)
      .then((r) => { if (!cancelled) setBrief(r.brief); })
      .catch((e) => { if (!cancelled) setError(e?.message || t('home.brief.loadFailed')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, storeId, data, attempt]);

  const write = async (refresh: boolean) => {
    setWriting(true);
    setError(null);
    try {
      const r = await data.getAiBrief(accessToken, storeId, refresh);
      setBrief(r.brief);
      if (r.note) toast.info(r.note);
    } catch (e: any) {
      setError(e?.message || t('home.brief.loadFailed'));
    } finally {
      setWriting(false);
    }
  };

  const highlights = brief ? briefHighlights(brief.text) : [];
  let body: React.ReactNode;
  if (loading) body = <SkeletonText lines={3} />;
  else if (error) body = <ErrorState body={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (writing) body = (
    <div className="flex flex-col gap-2" aria-busy="true">
      <SkeletonText lines={3} />
      <p className="text-label text-text-3">{t('home.brief.writing')}</p>
    </div>
  );
  else if (brief) body = compact ? (
    <ul className="flex flex-col gap-1.5 pl-5 text-body-md text-text marker:text-text-3 [list-style:disc]">
      {highlights.map((line, i) => <li key={i}>{line}</li>)}
    </ul>
  ) : <BriefText text={brief.text} />;
  else if (canManage) body = (
    <Button variant="secondary" fullWidth leadingIcon={<Sparkles />} onClick={() => write(false)}>{t('home.brief.write')}</Button>
  );
  else body = <p className="text-body-sm text-text-2">{t('home.brief.notYet')}</p>;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby="brief-title">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 shrink-0 text-text-2" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="brief-title" className="text-subtitle font-semibold text-text">{t('home.brief.title')}</h2>
          {!compact && !brief && <span className="text-caption text-text-3">{t('home.brief.hint')}</span>}
        </div>
        {brief && <span className="num shrink-0 text-caption text-text-3">{t('home.brief.by', { time: timeOfBrief(brief.generatedAt) })}</span>}
        {brief && canManage && (
          <IconButton label={t('home.brief.refresh')} icon={<RefreshCw className={cn(writing && 'animate-spin')} />} onClick={() => write(true)} disabled={writing} />
        )}
      </div>
      <div>{body}</div>
      {compact && brief && !loading && !error && !writing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFullOpen(true)}>{t('home.brief.readFull')}</Button>
          {onAskBunny && (
            <Button variant="ghost" size="sm" leadingIcon={<img src="/bunny-logo.png" alt="" className="size-5 object-contain" />} onClick={onAskBunny}>{t('nav.askBunny')}</Button>
          )}
        </div>
      )}
      {compact && brief && (
        <ResponsiveModal open={fullOpen} onOpenChange={setFullOpen} title={t('home.brief.title')} description={t('home.brief.by', { time: timeOfBrief(brief.generatedAt) })} size="detail">
          <BriefText text={brief.text} />
        </ResponsiveModal>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { photoPath } from './workplaceApi';
import { teamWorkplaceApi } from '../team/teamApi';

// A workplace photo loaded through the server with the sign-in token, fetched only once it
// scrolls into view so a month-long gallery doesn't pull hundreds of photos at once.
export function AuthedPhoto({ date, employeeId, itemId, thumb, version, className, alt = '', fit = 'cover' }: {
  date: string; employeeId: string; itemId: string; thumb: boolean; version?: string; className?: string; alt?: string; fit?: 'cover' | 'contain';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setUrl(null);
    setFailed(null);
    teamWorkplaceApi.loadPhotoUrl(photoPath(date, employeeId, itemId, thumb), version || '')
      .then((u: string) => { if (!cancelled) setUrl(u); })
      .catch((e: Error) => { if (!cancelled) setFailed(e?.message || 'Could not load'); });
    return () => { cancelled = true; };
  }, [visible, date, employeeId, itemId, thumb, version]);

  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-surface-2', className)}>
      {url ? (
        <img src={url} alt={alt} className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover')} />
      ) : failed ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center text-caption text-text-2" title={failed}>
          <ImageOff className="size-5" aria-hidden="true" />
          <span className="line-clamp-2">{failed}</span>
        </div>
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </div>
  );
}

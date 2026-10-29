// A sample photo from the photo guide (owner, 29 Oct 2026): how a check should be photographed.
// Loaded through the server with the sign-in token like every workplace photo; tap to see it large.
import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { ResponsiveModal } from '../ui/responsive-modal';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import { samplePath } from './workplaceApi';
import { teamWorkplaceApi } from '../team/teamApi';

type Ref = { kind: string; locId: string; itemId: string; sampleId: string };

function useSampleUrl(r: Ref, thumb: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    teamWorkplaceApi.loadPhotoUrl(samplePath(r.kind, r.locId, r.itemId, r.sampleId, thumb), r.sampleId)
      .then((u: string) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [r.kind, r.locId, r.itemId, r.sampleId, thumb]);
  return { url, failed };
}

function Img({ r, thumb, className, alt, fit = 'cover' }: { r: Ref; thumb: boolean; className?: string; alt: string; fit?: 'cover' | 'contain' }) {
  const { url, failed } = useSampleUrl(r, thumb);
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {url ? <img src={url} alt={alt} className={cn('h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover')} />
        : failed ? <div className="flex h-full w-full items-center justify-center text-text-3"><ImageOff className="size-5" aria-hidden="true" /></div>
          : <Skeleton className="h-full w-full rounded-none" />}
    </div>
  );
}

/** A small sample tile that opens the photo large. */
export function SampleTile({ kind, locId, itemId, sampleId, label, className }: Ref & { label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const r = { kind, locId, itemId, sampleId };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label}
        className={cn('relative size-20 shrink-0 overflow-hidden rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}>
        <Img r={r} thumb alt="" className="h-full w-full" />
      </button>
      {open && (
        <ResponsiveModal open onOpenChange={(o) => !o && setOpen(false)} size="detail" title={label}>
          <Img r={r} thumb={false} fit="contain" alt={label} className="aspect-[4/3] w-full rounded-lg" />
        </ResponsiveModal>
      )}
    </>
  );
}

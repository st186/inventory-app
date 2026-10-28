// Several photos per check (owner, 28 Oct 2026: walls, shelves, stacks of crates). The check keeps
// one set of storage and AI fields - a roll-up of its photos - so the KPI, review and complaint
// readers still see one answer per check. No Deno or network here, so plain node can test it
// (workplacePhotos.test.ts).

export type AiStatus = 'pending' | 'scored' | 'failed' | 'off';
export type AiFields = { aiStatus?: AiStatus; aiScore?: number; aiVerdict?: string; aiIssues?: string[]; aiIssuesBengali?: string[]; aiShown?: string; aiSevere?: boolean; aiAt?: string };
export type StoredFields = { storage: 'drive' | 'bucket'; path: string; driveFileId?: string; driveThumbId?: string; thumbPath?: string; mimeType: string };
export type Photo = StoredFields & AiFields & { id: string; uploadedAt: string; onBehalf?: boolean; uploadedByName?: string };
type Flag = { status: 'ok' | 'needs_cleaning'; note: string; by: string; byId?: string; at: string; auto?: boolean; fixedAt?: string };
export type PhotoItem = StoredFields & AiFields & { uploadedAt: string; onBehalf?: boolean; uploadedByName?: string; photos?: Photo[]; flag?: Flag; wasSevere?: boolean };

export const AI_KEYS = ['aiStatus', 'aiScore', 'aiVerdict', 'aiIssues', 'aiIssuesBengali', 'aiShown', 'aiSevere', 'aiAt'] as const;
export const STORED_KEYS = ['storage', 'path', 'driveFileId', 'driveThumbId', 'thumbPath', 'mimeType'] as const;

// A check's photos; one saved before several were allowed reads as a list of one.
export function photosOf(it: PhotoItem): Photo[] {
  if (it.photos?.length) return it.photos;
  const p: Record<string, unknown> = { id: 'p0', uploadedAt: it.uploadedAt };
  for (const k of [...STORED_KEYS, ...AI_KEYS]) if (it[k] !== undefined) p[k] = it[k];
  if (it.onBehalf) { p.onBehalf = true; p.uploadedByName = it.uploadedByName; }
  return [p as Photo];
}

// Low enough (or filthy enough) to send the check back. An unreadable photo is never low.
export const isLow = (p: AiFields, threshold: number) =>
  p.aiStatus === 'scored' && p.aiVerdict !== 'unclear_photo' && ((p.aiScore ?? 10) < threshold || !!p.aiSevere);

// The check's own fields from its photos: the first is the cover, the newest sets the time, and
// the AI answer is the worst readable photo's (a garbage dump first, then the lowest score), with
// the issues of all of them.
export function rollUp(it: PhotoItem) {
  const photos = photosOf(it);
  it.photos = photos;
  for (const k of STORED_KEYS) delete (it as Partial<PhotoItem>)[k];
  Object.assign(it, Object.fromEntries(STORED_KEYS.filter((k) => photos[0][k] !== undefined).map((k) => [k, photos[0][k]])));
  it.uploadedAt = photos.reduce((m, p) => (p.uploadedAt > m ? p.uploadedAt : m), photos[0].uploadedAt);
  for (const k of AI_KEYS) delete it[k];
  const states = photos.map((p) => p.aiStatus || 'off');
  it.aiStatus = states.includes('pending') ? 'pending' : states.includes('scored') ? 'scored' : states.includes('failed') ? 'failed' : 'off';
  const scored = photos.filter((p) => p.aiStatus === 'scored' && typeof p.aiScore === 'number');
  const readable = scored.filter((p) => p.aiVerdict !== 'unclear_photo');
  const ranked = [...(readable.length ? readable : scored)].sort((a, b) => Number(!!b.aiSevere) - Number(!!a.aiSevere) || (a.aiScore! - b.aiScore!));
  const worst = ranked[0];
  if (!worst) return;
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].slice(0, 8);
  it.aiScore = worst.aiScore;
  it.aiVerdict = !readable.length ? 'unclear_photo' : readable.some((p) => p.aiVerdict === 'needs_cleaning') ? 'needs_cleaning' : worst.aiVerdict;
  it.aiShown = worst.aiShown;
  it.aiIssues = uniq(ranked.flatMap((p) => p.aiIssues || []));
  it.aiIssuesBengali = uniq(ranked.flatMap((p) => p.aiIssuesBengali || []));
  if (readable.some((p) => p.aiSevere)) it.aiSevere = true;
  it.aiAt = scored.reduce((m, p) => (p.aiAt && p.aiAt > m ? p.aiAt : m), '') || undefined;
}

// After the photos change: a low or filthy readable photo marks the check needs-cleaning unless a
// reviewer has already decided; once no photo is low, the AI's own flag goes. A garbage dump stays
// on the day's record even after a clean retake (owner, 28 Oct 2026).
export function settleFlag(it: PhotoItem, threshold: number) {
  if (it.aiSevere) it.wasSevere = true;
  if (it.flag && !it.flag.auto) return;
  if (photosOf(it).some((p) => isLow(p, threshold))) {
    const issues = (it.aiIssues || []).join('; ');
    it.flag = {
      status: 'needs_cleaning', note: `${it.aiSevere ? 'Serious: ' : ''}AI score ${it.aiScore}/10${issues ? `: ${issues}` : ''}`,
      by: 'AI check', byId: 'ai', at: it.flag?.at || new Date().toISOString(), auto: true,
    };
  } else if (it.flag?.auto) delete it.flag;
}

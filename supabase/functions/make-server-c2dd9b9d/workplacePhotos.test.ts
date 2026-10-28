// Tests for several photos per check. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/workplacePhotos.test.ts
import assert from 'node:assert/strict';
import { isLow, photosOf, rollUp, settleFlag, type Photo, type PhotoItem } from './workplacePhotos.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const photo = (id: string, at: string, extra: Partial<Photo> = {}): Photo => ({ id, uploadedAt: `2026-10-28T${at}:00Z`, storage: 'bucket', path: `x/${id}.jpg`, mimeType: 'image/jpeg', ...extra });
const item = (photos: Photo[], extra: Partial<PhotoItem> = {}): PhotoItem => ({ storage: 'bucket', path: '', mimeType: 'image/jpeg', uploadedAt: '', photos, ...extra });

test('a check saved before several photos reads as one photo', () => {
  const old: PhotoItem = { storage: 'drive', path: 'a.jpg', driveFileId: 'F1', mimeType: 'image/jpeg', uploadedAt: '2026-10-27T09:00:00Z', aiStatus: 'scored', aiScore: 7, aiVerdict: 'clean' };
  const [p] = photosOf(old);
  assert.equal(p.id, 'p0');
  assert.equal(p.driveFileId, 'F1');
  assert.equal(p.aiScore, 7);
  rollUp(old);
  assert.equal(old.photos?.length, 1);
  assert.equal(old.aiScore, 7);
});

test('the check answers with its worst readable photo', () => {
  const it = item([
    photo('a', '09:00', { aiStatus: 'scored', aiScore: 9, aiVerdict: 'clean', aiIssues: [] }),
    photo('b', '09:05', { aiStatus: 'scored', aiScore: 4, aiVerdict: 'needs_cleaning', aiIssues: ['Stains on the lid'] }),
    photo('c', '09:07', { aiStatus: 'scored', aiScore: 2, aiVerdict: 'unclear_photo', aiIssues: ['Too dark'] }),
  ]);
  rollUp(it);
  assert.equal(it.aiScore, 4); // the unreadable photo's 2 doesn't count
  assert.equal(it.aiVerdict, 'needs_cleaning');
  assert.deepEqual(it.aiIssues, ['Stains on the lid']);
  assert.equal(it.path, 'x/a.jpg'); // the first photo is the cover
  assert.equal(it.uploadedAt, '2026-10-28T09:07:00Z'); // the newest sets the time
  assert.equal(it.aiStatus, 'scored');
});

test('still checking while any photo waits; all unreadable reads as unclear', () => {
  const waiting = item([photo('a', '09:00', { aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean' }), photo('b', '09:01', { aiStatus: 'pending' })]);
  rollUp(waiting);
  assert.equal(waiting.aiStatus, 'pending');
  assert.equal(waiting.aiScore, 8);
  const dark = item([photo('a', '09:00', { aiStatus: 'scored', aiScore: 3, aiVerdict: 'unclear_photo' })]);
  rollUp(dark);
  assert.equal(dark.aiVerdict, 'unclear_photo');
  assert.equal(isLow(dark.photos![0], 6), false);
});

test('the AI flag comes with a low photo and goes once it is retaken clean; filth stays on record', () => {
  const it = item([photo('a', '09:00', { aiStatus: 'scored', aiScore: 9, aiVerdict: 'clean' }), photo('b', '09:01', { aiStatus: 'scored', aiScore: 3, aiVerdict: 'needs_cleaning', aiSevere: true })]);
  rollUp(it);
  settleFlag(it, 6);
  assert.equal(it.flag?.status, 'needs_cleaning');
  assert.equal(it.flag?.auto, true);
  assert.match(it.flag!.note, /^Serious: AI score 3\/10/);
  assert.equal(it.wasSevere, true);
  it.photos![1] = photo('b2', '09:10', { aiStatus: 'scored', aiScore: 8, aiVerdict: 'clean' }); // the retake
  rollUp(it);
  settleFlag(it, 6);
  assert.equal(it.flag, undefined);
  assert.equal(it.aiSevere, undefined);
  assert.equal(it.wasSevere, true); // the incharge's KPI still sees it
});

test('a reviewer\'s own verdict is never overwritten by the AI', () => {
  const it = item([photo('a', '09:00', { aiStatus: 'scored', aiScore: 2, aiVerdict: 'needs_cleaning' })], { flag: { status: 'ok', note: 'Old stain, fine', by: 'Incharge', at: '2026-10-28T09:30:00Z' } });
  rollUp(it);
  settleFlag(it, 6);
  assert.equal(it.flag?.status, 'ok');
});

console.log(`workplacePhotos: ${passed} tests passed`);

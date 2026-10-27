// Shared bits for the Workplace checks screens: photo shrinking, IST times, status labels.
import { getNowIST } from '../../utils/timezone';
import type { CheckStatus } from './workplaceApi';

// Phone photos are several MB. The server takes up to 1.5 MB; 1280 px JPEG at 0.7 is ~200-400 KB,
// plenty to judge cleanliness, and a 320 px thumbnail (~20 KB) keeps the review grid quick.
const MAX_SIDE = 1280;
const THUMB_SIDE = 320;
const MAX_DATA_URL = 1_900_000;

function draw(img: HTMLImageElement, side: number, quality: number) {
  const scale = Math.min(1, side / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function compressPhoto(file: File): Promise<{ image: string; thumb: string }> {
  return new Promise((resolve, reject) => {
    if (file.type && !file.type.startsWith('image/')) { reject(new Error('That is not a photo · এটা ছবি নয়')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let image = draw(img, MAX_SIDE, 0.7);
      if (image.length > MAX_DATA_URL) image = draw(img, MAX_SIDE, 0.5);
      resolve({ image, thumb: draw(img, THUMB_SIDE, 0.6) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo - try again · ছবিটা পড়া গেল না, আবার তুলুন')); };
    img.src = url;
  });
}

export function nowMinutesIST() {
  const iso = getNowIST();
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}
export const toMin = (t: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function fmt12(t: string) {
  if (!t) return '';
  const h = Number(t.slice(0, 2)); const m = t.slice(3, 5);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const bnDigits = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
// "by 4 PM" in Bengali: "৪টের মধ্যে", "৪:৩০-এর মধ্যে".
export function bnBy(t: string) {
  if (!t) return '';
  const h = Number(t.slice(0, 2)) % 12 || 12; const m = t.slice(3, 5);
  return m === '00' ? `${bnDigits(String(h))}টের মধ্যে` : `${bnDigits(`${h}:${m}`)}-এর মধ্যে`;
}
export const timeOfIso = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 330 * 60000).toISOString();
  return fmt12(d.slice(11, 16));
};

// Same rules as the server's statusOf: late = window over and no photo yet (still accepted today);
// missed = the day is over.
export function liveStatus(date: string, today: string, nowMin: number, start: string, end: string, hasPhoto: boolean, late?: boolean): CheckStatus {
  if (hasPhoto) return late ? 'done_late' : 'done';
  if (date < today) return 'missed';
  if (date > today || !start) return 'upcoming';
  if (nowMin < toMin(start)) return 'upcoming';
  if (nowMin <= toMin(end)) return 'due';
  return 'late';
}

export function statusMeta(status: CheckStatus, start: string, end: string): { label: string; cls: string } {
  switch (status) {
    case 'done': return { label: 'Done · হয়ে গেছে', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'done_late': return { label: 'Done late · দেরিতে দেওয়া', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'due': return { label: `Due by ${fmt12(end)} · ${bnBy(end)}`, cls: 'bg-orange-100 text-orange-800 border-orange-200' };
    case 'late': return { label: 'Late - send now · দেরি হয়েছে, এখনই দিন', cls: 'bg-red-100 text-red-800 border-red-200' };
    case 'missed': return { label: 'Missed · দেওয়া হয়নি', cls: 'bg-red-200 text-red-900 border-red-300' };
    default: return { label: start ? `Opens ${fmt12(start)} · ${bnDigits(fmt12(start))} থেকে` : 'Later · পরে', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  }
}

// AI score colour: green at or above the auto-flag score, red below it.
export function scoreCls(score: number, threshold: number) {
  if (score >= Math.max(threshold + 2, 8)) return 'bg-emerald-600 text-white';
  if (score >= threshold) return 'bg-lime-600 text-white';
  if (score >= threshold - 2) return 'bg-amber-500 text-white';
  return 'bg-red-600 text-white';
}

export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

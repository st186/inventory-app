// The payslip PDF (owner, 29 Oct 2026: design E on the payslip canvas - the classic earnings |
// deductions table with Bengali under every label). Drawn on a canvas with the app's own fonts
// (Inter, Noto Sans Bengali - a PDF can't carry Bengali text without a shaping engine), then put
// into a one-page A4 PDF as a sharp JPEG. No library: the PDF is a handful of objects written here.
// The numbers come from the server (performance.ts / payslipRules.ts) as they are.
import type { Payslip } from '../components/performance/perfApi';
import { saveFile } from './saveFile';

const W = 794; // A4 at 96 px/in
const H = 1123;
const SCALE = 2.5; // ~240 dpi
const ACCENT = '#C2410C';
const INK = '#1C1917';
const MUTED = '#57534E';
const LABEL = '#44403C';
const RULE = '#D6D3D1';
const RULE_SOFT = '#E7E5E4';
const EN = '"Inter Variable", Inter, "Segoe UI", Arial, sans-serif';
const BN = '"Noto Sans Bengali Variable", "Noto Sans Bengali", "Hind Siliguri", sans-serif';
const ADDRESS = 'Perbirhata, opposite Vmart, Burdwan - 713103';

const MONTHS_BN = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const bnDigits = (s: string | number) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const amount = (n: number) => Math.round(n).toLocaleString('en-IN');
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayText = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const ROLE: Record<string, string> = {
  store_incharge: 'Store incharge', store_ops: 'Store crew', production_incharge: 'Production incharge', production_ops: 'Kitchen crew',
  operations_incharge: 'Operations manager', operations_manager: 'Operations manager', rider: 'Rider', manager: 'Manager', employee: 'Staff',
};
const EARN_EN: Record<string, string> = { basic: 'Basic', hra: 'House rent allowance', conveyance: 'Conveyance', da: 'Dearness allowance', special: 'Special allowance', food: 'Food allowance' };
const LINE_BN: Record<string, string> = {
  basic: 'মূল বেতন', hra: 'বাড়ি ভাড়া ভাতা', conveyance: 'যাতায়াত ভাতা', da: 'মহার্ঘ ভাতা', special: 'বিশেষ ভাতা', food: 'খাবার ভাতা',
  vp: 'কাজের মান অনুযায়ী বেতন', bonus: 'বোনাস', other: 'অন্যান্য প্রাপ্য', pay: 'মাসের বেতন',
  advance: 'অগ্রিম বেতন কাটা', personal: 'আগে নেওয়া টাকা', short: 'বাদ যাওয়া দিন / অন্যান্য',
};
const PAID_FROM: Record<string, string> = { bank: 'bank transfer', cash: 'cash', paytm: 'Paytm / UPI', upi: 'UPI' };

type Ctx = CanvasRenderingContext2D;
type TextOpts = { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; bn?: boolean; spacing?: number; maxWidth?: number };

function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}) {
  let size = o.size || 13.5;
  ctx.font = `${o.weight || 400} ${size}px ${o.bn ? BN : EN}`;
  // Long text (amount in words, a long place name) shrinks to fit instead of running over.
  if (o.maxWidth) while (size > 9 && ctx.measureText(s).width > o.maxWidth) { size -= 0.5; ctx.font = `${o.weight || 400} ${size}px ${o.bn ? BN : EN}`; }
  ctx.fillStyle = o.color || INK;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'alphabetic';
  (ctx as any).letterSpacing = `${o.spacing || 0}px`;
  ctx.fillText(s, x, y);
  (ctx as any).letterSpacing = '0px';
  return ctx.measureText(s).width;
}
function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color = RULE, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function box(ctx: Ctx, x: number, y: number, w: number, h: number, o: { stroke?: string; fill?: string; width?: number; radius?: number }) {
  ctx.beginPath();
  // roundRect needs Safari 16; older iPhones get square corners.
  if (o.radius && typeof (ctx as any).roundRect === 'function') (ctx as any).roundRect(x, y, w, h, o.radius);
  else ctx.rect(x, y, w, h);
  if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 1; ctx.stroke(); }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`400 16px ${EN}`), document.fonts.load(`600 16px ${EN}`), document.fonts.load(`700 16px ${EN}`),
      document.fonts.load(`400 16px ${BN}`, 'বেতন'), document.fonts.load(`600 16px ${BN}`, 'বেতন'),
    ]);
  } catch { /* the fallback fonts still draw */ }
}

/** The payslip drawn on an A4 canvas (also used to preview it). */
export async function drawPayslip(slip: Payslip): Promise<HTMLCanvasElement> {
  await fontsReady();
  const logo = await loadImage(`${import.meta.env.BASE_URL || '/'}bunny-logo.png`);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  const L = 56;
  const R = W - 56;
  const CW = R - L;
  const [y0, m0] = slip.month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y0, m0, 0)).getUTCDate();
  const monthShort = new Date(`${slip.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

  // Letterhead
  if (logo) ctx.drawImage(logo, L, 52, 58, 58);
  text(ctx, 'Bunny Momos', L + 72, 80, { size: 24, weight: 700 });
  text(ctx, ADDRESS, L + 72, 101, { size: 12.5, color: MUTED });
  const bnTitle = ' · বেতনের স্লিপ';
  ctx.font = `600 12.5px ${BN}`;
  const bnW = ctx.measureText(bnTitle).width;
  text(ctx, bnTitle, R, 66, { size: 12.5, weight: 600, color: ACCENT, align: 'right', bn: true });
  text(ctx, 'PAYSLIP', R - bnW, 66, { size: 12.5, weight: 700, color: ACCENT, align: 'right', spacing: 2 });
  text(ctx, monthName(slip.month), R, 92, { size: 21, weight: 700, align: 'right' });
  text(ctx, `${MONTHS_BN[m0 - 1]} ${bnDigits(y0)}`, R, 110, { size: 11.5, color: MUTED, align: 'right', bn: true });
  line(ctx, L, 128, R, 128, ACCENT, 2);

  // Employee details: 4 rows of 2
  const e = slip.employee;
  const lastPay = slip.payments[slip.payments.length - 1];
  const paidOn = lastPay ? `${dayText(lastPay.date)}${lastPay.paidFrom ? ` · ${PAID_FROM[lastPay.paidFrom] || lastPay.paidFrom}` : ''}` : 'Not paid yet';
  const cells: [string, string, string][] = [
    ['Employee name', 'কর্মীর নাম', e.name],
    ['Employee ID', 'কর্মী আইডি', e.employeeId],
    ['Designation', 'পদ', ROLE[e.designation] || e.designation || '-'],
    ['Place of work', 'কাজের জায়গা', e.place || '-'],
    ['Date of joining', 'যোগদানের তারিখ', e.joiningDate ? dayText(e.joiningDate) : '-'],
    ['Leave taken', 'ছুটি নেওয়া', `${slip.leaveDays} day${slip.leaveDays === 1 ? '' : 's'}`],
    ['Pay period', 'বেতনের সময়কাল', `1–${lastDay} ${monthShort} ${y0}`],
    ['Paid on', 'বেতন দেওয়ার দিন', paidOn],
  ];
  const gy = 146;
  const rowH = 44;
  const colW = CW / 2;
  box(ctx, L, gy, CW, rowH * 4, { stroke: RULE });
  line(ctx, L + colW, gy, L + colW, gy + rowH * 4, RULE_SOFT);
  for (let i = 1; i < 4; i++) line(ctx, L, gy + rowH * i, R, gy + rowH * i, RULE_SOFT);
  cells.forEach(([en, bn, value], i) => {
    const x = L + (i % 2) * colW;
    const y = gy + Math.floor(i / 2) * rowH;
    text(ctx, en, x + 12, y + 19, { size: 13.5, color: LABEL });
    text(ctx, bn, x + 12, y + 36, { size: 11.5, color: MUTED, bn: true });
    text(ctx, value, x + colW - 12, y + 27, { size: 13.5, weight: 600, align: 'right', maxWidth: colW - 140 });
  });

  // Earnings | Deductions
  const ty = gy + rowH * 4 + 18;
  const cols = [L, L + 241, L + 341, L + 582, R];
  const headH = 42;
  box(ctx, L, ty, CW, headH, { fill: '#F5F5F4', stroke: RULE });
  const head: [string, string, number, CanvasTextAlign][] = [['Earnings', 'আয়', 0, 'left'], ['Amount (₹)', '', 1, 'right'], ['Deductions', 'কাটা হয়েছে', 2, 'left'], ['Amount (₹)', '', 3, 'right']];
  for (const [en, bn, c, align] of head) {
    const x = align === 'right' ? cols[c + 1] - 12 : cols[c] + 12;
    text(ctx, en, x, ty + (bn ? 19 : 26), { size: 13, weight: 600, color: '#292524', align });
    if (bn) text(ctx, bn, x, ty + 35, { size: 11.5, color: MUTED, bn: true, align });
  }
  const rows = Math.max(slip.earnings.length, slip.deductions.length, 1);
  const lineH = 36;
  const by = ty + headH;
  const bodyH = rows * lineH;
  const totalH = 40;
  box(ctx, L, by, CW, bodyH + totalH, { stroke: RULE });
  for (const x of cols.slice(1, 4)) line(ctx, x, ty, x, by + bodyH + totalH, RULE);
  const earnLabel = (k: string, label: string) => k === 'vp' && slip.kpi ? `Variable pay (KPI ${slip.kpi.score}/100)` : EARN_EN[k] || label;
  slip.earnings.forEach((l, i) => {
    const y = by + i * lineH;
    text(ctx, earnLabel(l.key, l.label), cols[0] + 12, y + 17, { size: 13.5, maxWidth: 220 });
    if (LINE_BN[l.key]) text(ctx, LINE_BN[l.key], cols[0] + 12, y + 31, { size: 11.5, color: MUTED, bn: true });
    text(ctx, amount(l.amount), cols[2] - 12, y + 23, { size: 13.5, align: 'right' });
  });
  slip.deductions.forEach((l, i) => {
    const y = by + i * lineH;
    text(ctx, l.label, cols[2] + 12, y + 17, { size: 13.5, maxWidth: 220 });
    if (LINE_BN[l.key]) text(ctx, LINE_BN[l.key], cols[2] + 12, y + 31, { size: 11.5, color: MUTED, bn: true });
    text(ctx, amount(l.amount), cols[4] - 12, y + 23, { size: 13.5, align: 'right' });
  });
  const tyT = by + bodyH;
  box(ctx, L, tyT, CW, totalH, { fill: '#FAFAF9', stroke: RULE });
  for (const x of cols.slice(1, 4)) line(ctx, x, tyT, x, tyT + totalH, RULE);
  text(ctx, 'Total earnings', cols[0] + 12, tyT + 18, { size: 13.5, weight: 700 });
  text(ctx, 'মোট আয়', cols[0] + 12, tyT + 33, { size: 11.5, color: MUTED, bn: true });
  text(ctx, amount(slip.totalEarnings), cols[2] - 12, tyT + 25, { size: 13.5, weight: 700, align: 'right' });
  text(ctx, 'Total deductions', cols[2] + 12, tyT + 18, { size: 13.5, weight: 700 });
  text(ctx, 'মোট কাটা', cols[2] + 12, tyT + 33, { size: 11.5, color: MUTED, bn: true });
  text(ctx, amount(slip.totalDeductions), cols[4] - 12, tyT + 25, { size: 13.5, weight: 700, align: 'right' });

  // Net pay
  const ny = tyT + totalH + 18;
  box(ctx, L, ny, CW, 74, { stroke: ACCENT, width: 2, radius: 4 });
  const netW = text(ctx, 'NET PAY', L + 20, ny + 30, { size: 13.5, weight: 700, color: ACCENT, spacing: 1 });
  text(ctx, ' · হাতে পাবেন', L + 20 + netW + 7, ny + 30, { size: 13, weight: 600, color: ACCENT, bn: true });
  text(ctx, slip.inWords, L + 20, ny + 53, { size: 13.5, color: LABEL, maxWidth: CW - 230 });
  text(ctx, rupees(slip.net), R - 20, ny + 48, { size: 32, weight: 700, align: 'right' });

  // Notes
  let y = ny + 74 + 28;
  const note = (en: string, bn?: string) => {
    const w = text(ctx, en, L, y, { size: 13, color: LABEL, maxWidth: CW - (bn ? 180 : 0) });
    if (bn) text(ctx, bn, L + Math.min(w, CW - 180) + 6, y, { size: 12, color: MUTED, bn: true });
    y += 22;
  };
  if (slip.kpi && slip.earnings.some((l) => l.key === 'vp')) note(`Variable pay: KPI score ${slip.kpi.score} of 100${slip.kpi.max ? ` × ${rupees(slip.kpi.max)}` : ''}.`, `KPI ${bnDigits(slip.kpi.score)}/১০০ অনুযায়ী।`);
  if (slip.advanceLeft > 0) note(`Salary advance: ${rupees(slip.advanceLeft)} still to recover.`, `অগ্রিমের ${rupees(slip.advanceLeft)} বাকি।`);
  if (slip.payments.length) {
    const paid = slip.payments.map((p) => `${dayText(p.date)} ${rupees(p.amount)}${p.paidFrom ? ` by ${PAID_FROM[p.paidFrom] || p.paidFrom}` : ''}${p.ref ? `, ref ending ${p.ref}` : ''}`);
    note(`Paid: ${paid.join('; ')}.`);
  }

  // Footer
  line(ctx, L, H - 66, R, H - 66, RULE);
  const fw = text(ctx, 'Computer-generated payslip, no signature needed.', L, H - 44, { size: 11.5, color: MUTED });
  text(ctx, 'কম্পিউটারে তৈরি, সই লাগবে না।', L + fw + 6, H - 44, { size: 11, color: MUTED, bn: true });
  text(ctx, slip.number, R, H - 44, { size: 11.5, color: MUTED, align: 'right' });
  return canvas;
}

const enc = new TextEncoder();

/** A one-page A4 PDF holding a JPEG. */
export function jpegToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number, title: string): Blob {
  const pw = 595.28; // A4 in points
  const ph = 841.89;
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const safeTitle = title.replace(/[()\\]/g, '');
  const parts: (string | Uint8Array)[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: string | Uint8Array) => { const bytes = typeof p === 'string' ? enc.encode(p) : p; parts.push(bytes); length += bytes.length; };
  const obj = (n: number, body: string | (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const b of Array.isArray(body) ? body : [body]) push(b);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${safeTitle}) /Producer (Bunny Momos app) >>`);
  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export async function payslipPdf(slip: Payslip): Promise<Blob> {
  const canvas = await drawPayslip(slip);
  const jpegBlob: Blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the payslip'))), 'image/jpeg', 0.92));
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  return jpegToPdf(jpeg, canvas.width, canvas.height, `Payslip ${monthName(slip.month)} - ${slip.employee.name}`);
}

/** Makes the PDF and saves it (Android: Downloads/Bunny Momos and the share sheet; browser: a download). */
export async function downloadPayslip(slip: Payslip): Promise<void> {
  const blob = await payslipPdf(slip);
  await saveFile(`Payslip-${slip.employee.employeeId}-${slip.month}.pdf`, blob, 'application/pdf');
}

// Names, numbers and messages for the recipe screens, in the person's language.
import { INGREDIENT_BY_ID, MOMO_TYPES, SHEET_BY_ID, type Lang3 } from '../../utils/recipeCatalog';
import type { Issue, PriceInfo, SheetStatus } from '../../utils/recipeRules';
import type { I18nKey, I18nVars, Lang } from '../../utils/i18n';
import { formatNumberIN } from '../ui/money';
import type { StatusTone } from '../ui/status-chip';

type T = (key: I18nKey, vars?: I18nVars) => string;

export const pick = (lang: Lang, o: Lang3) => (lang === 'bn' ? o.bn : lang === 'hi' ? o.hi : o.en);
export const sheetName = (lang: Lang, id: string) => (SHEET_BY_ID[id] ? pick(lang, SHEET_BY_ID[id]) : id);
export const sheetCode = (id: string) => SHEET_BY_ID[id]?.code || id;
export const ingName = (lang: Lang, key: string, name?: string) => (INGREDIENT_BY_ID[key] ? pick(lang, INGREDIENT_BY_ID[key]) : name || key.replace(/^x:/, '').replace(/-/g, ' '));
export const momoName = (lang: Lang, key: string) => {
  const m = MOMO_TYPES.find((x) => x.key === key);
  return m ? pick(lang, m) : key;
};

// 0.82 -> "0.82", 3.256 -> "3.26", 98.60 -> "98.6", 1500 -> "1,500"
export function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  const [int, frac = ''] = Math.abs(r).toFixed(dp).split('.');
  const f = frac.replace(/0+$/, '');
  return `${r < 0 ? '−' : ''}${formatNumberIN(Number(int), { decimals: 0 })}${f ? `.${f}` : ''}`;
}
// Grams for people: "820 g", "3.25 kg".
export function fmtG(g: number | null | undefined): string {
  if (g === null || g === undefined || !Number.isFinite(g)) return '–';
  if (Math.abs(g) >= 1000) return `${fmtNum(g / 1000, 2)} kg`;
  return `${fmtNum(g, g < 100 ? 1 : 0)} g`;
}
export const fmtPct = (n: number | null | undefined, dp = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : `${fmtNum(n, dp)}%`);
export const fmtRs = (n: number | null | undefined, dp?: number) =>
  n === null || n === undefined || !Number.isFinite(n) ? '–' : `₹${formatNumberIN(Math.round(n * 100) / 100, { decimals: dp ?? (Math.abs(n) < 100 ? 2 : 0) })}`;

// "26 Oct" / "26 Oct, 9:10 am"
export function fmtDay(t: T, iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = iso.slice(0, 10).split('-');
  if (d.length < 3) return iso;
  return `${Number(d[2])} ${t(`date.ms.${Number(d[1]) - 1}` as I18nKey)}`;
}
export function fmtTime(time?: string) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return '';
  const h = Number(time.slice(0, 2));
  return `${h % 12 || 12}:${time.slice(3)} ${h >= 12 ? 'pm' : 'am'}`;
}
// An ISO time (UTC) as an IST day + clock.
export function istParts(iso: string): { date: string; time: string } {
  const d = new Date(Date.parse(iso) + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

export function statusView(t: T, s: SheetStatus): { tone: StatusTone; label: string } {
  if (s.code === 'ready') return { tone: 'info', label: t('recipes.status.ready') };
  if (s.code === 'set') return { tone: 'success', label: s.newSince ? t('recipes.status.setNew', { v: s.version ?? 1, n: s.newSince }) : t('recipes.status.set', { v: s.version ?? 1 }) };
  return { tone: s.n ? 'warning' : 'neutral', label: t('recipes.status.nOf3', { n: s.n }) };
}

export function issueText(t: T, lang: Lang, i: Issue): string {
  const vars: I18nVars = { ...(i.vars || {}) };
  if (i.lineKey) vars.name = ingName(lang, i.lineKey, undefined);
  if (typeof vars.qty === 'number') vars.qty = fmtNum(vars.qty, 3);
  return t(`recipes.issue.${i.code}` as I18nKey, vars);
}

export function fixLabel(t: T, i: Issue, qty: number | null | undefined): string {
  if (!i.fix) return '';
  return t('recipes.fixTo', { qty: fmtNum(qty ?? 0, 3), unit: i.fix.unit });
}

export function priceMissText(t: T, lang: Lang, p: PriceInfo): string {
  if (p.ok) return '';
  if (p.source === 'component') {
    const id = p.component?.sheetId || '';
    return p.reason === 'no-standard'
      ? t('recipes.price.componentNotSet', { code: sheetCode(id), name: sheetName(lang, id) })
      : t('recipes.price.componentNoPrice', { code: sheetCode(id) });
  }
  if (p.reason === 'piece-no-weight') return t('recipes.price.pieceNoWeight');
  if (p.reason === 'implausible') return t('recipes.price.implausible');
  if (p.reason === 'too-old') return t('recipes.price.tooOld');
  return t('recipes.price.noPurchases');
}

export function priceSourceText(t: T, p: PriceInfo): string {
  if (!p.ok) return '';
  if (p.source === 'free') return t('recipes.price.free');
  if (p.source === 'component') return t('recipes.price.fromStandard', { code: sheetCode(p.component?.sheetId || ''), v: p.component?.version ?? 1 });
  const d = p.detail;
  if (!d) return '';
  return t(d.confidence === 'few' ? 'recipes.price.fewBills' : 'recipes.price.bills', { n: d.samples, date: fmtDay(t, d.latestDate) });
}

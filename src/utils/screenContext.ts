// Which screen (and tab) the person is on, so the Bunny chat can explain what they're looking at.
// App.tsx sets the page; screens with tabs (Analytics) set the tab. The visible text of the
// screen goes with each question - except on pages with personal details, and anything inside
// an element marked data-ai-private (e.g. per-person salaries) is left out.
import { useEffect, useState } from 'react';

export type ScreenContext = { page: string; tab?: string };

let current: ScreenContext = { page: 'analytics' };
const listeners = new Set<(s: ScreenContext) => void>();

export function setScreenPage(page: string) {
  if (current.page === page) return;
  current = { page };
  listeners.forEach((fn) => fn(current));
}

export function setScreenTab(tab: string | undefined) {
  if (current.tab === tab) return;
  current = { ...current, tab };
  listeners.forEach((fn) => fn(current));
}

export function useScreenContext() {
  const [screen, setScreen] = useState(current);
  useEffect(() => {
    listeners.add(setScreen);
    setScreen(current);
    return () => { listeners.delete(setScreen); };
  }, []);
  return screen;
}

// Pages whose content never goes to the AI: people's details, pay, attendance, rider locations,
// backups and exports.
const PRIVATE_PAGES = new Set(['employees', 'payroll', 'attendance', 'riders', 'rider-profile', 'backup', 'export', 'assets']);
export const screenIsPrivate = (page: string) => PRIVATE_PAGES.has(page);

// The screen's visible text (main content only, private parts removed), trimmed for the AI.
export function captureScreenText(maxChars = 6000): string {
  if (screenIsPrivate(current.page)) return '';
  const main = document.querySelector('[data-ai-screen]') as HTMLElement | null;
  if (!main) return '';
  let text = main.innerText || '';
  main.querySelectorAll<HTMLElement>('[data-ai-private]').forEach((el) => {
    const hidden = el.innerText;
    if (hidden) text = text.split(hidden).join('[private]');
  });
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars);
}

// Names used in suggestions and in the request to the server.
export const PAGE_LABELS: Record<string, string> = {
  analytics: 'Analytics',
  sales: 'Sales',
  inventory: 'Expense',
  production: 'Production',
  'stock-requests': 'Stock requests',
  'receive-stock': 'Receive stock',
  'stock-outs': 'Out of stock',
  'advanced-inventory': 'Stock',
  'inventory-items': 'Item catalog',
  // Not a private page: workplace photos are fine, people's names and the photo grid are marked
  // data-ai-private on the screen itself.
  workplace: 'Workplace checks',
};

export const TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  profit: 'Revenue & Channels',
  expense: 'Costs & Margins',
  'unit-economics': 'Unit Economics',
  sales: 'Item Performance',
  'cash-reconciliation': 'Cash & Reconciliation',
  production: 'Production',
  'production-requests': 'Stock Requests',
  'stock-request-analysis': 'Store-Production SLA',
  'recalibration-reports': 'Recalibration',
  trends: 'Trends & Growth',
};

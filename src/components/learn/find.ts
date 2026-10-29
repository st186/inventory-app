// Finding the part of the screen a lesson step lights up, by what the person sees on it: a
// button's words, a field's label, a line of text, a section's heading, or a data-tour mark.
// Words can be given in both languages (["End shift", "শিফট শেষ করুন"]): the crew practise on
// Bengali screens.
// Each returns a function the lesson calls until the part appears (screens load after a tap).
// The lesson's own overlay (data-coach) is never matched.

export type Find = () => Element | null;
/** What to look for: one wording, or the same thing in each language. */
export type Words = string | string[];

const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const wants = (w: Words) => (Array.isArray(w) ? w : [w]).map(norm).filter(Boolean);

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/** The sheet or dialog on top (not the lesson's own card). */
export function topSheet(): Element | null {
  const open = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog]')).filter((d) => !d.closest('[data-coach]') && visible(d));
  return open[open.length - 1] || null;
}

type Where = { sheet?: boolean };
const rootOf = (o: Where): ParentNode | null => (o.sheet ? topSheet() : document);

/** A data-tour mark (the nav tabs, Home's cards). */
export const tour = (id: string): Find => () => {
  for (const el of Array.from(document.querySelectorAll(`[data-tour="${id}"]`))) if (!el.closest('[data-coach]') && visible(el)) return el;
  return null;
};

/** A button, link, row, tick box or choice whose name or words contain `name`. */
export const button = (name: Words, o: Where & { exact?: boolean } = {}): Find => () => {
  const root = rootOf(o);
  if (!root) return null;
  const want = wants(name);
  for (const el of Array.from(root.querySelectorAll('button,[role=button],a[href],[role=radio],[role=checkbox],[role=tab],[role=option],label'))) {
    if (el.closest('[data-coach]') || !visible(el)) continue;
    const label = norm(el.getAttribute('aria-label') || el.textContent);
    if (want.some((w) => (o.exact ? label === w : label.includes(w)))) return el;
  }
  return null;
};

/** The smallest piece of text on screen that contains `text`. */
export const text = (words: Words, o: Where = {}): Find => () => {
  for (const one of wants(words)) {
    const el = textOne(one, o);
    if (el) return el;
  }
  return null;
};
function textOne(want: string, o: Where): Element | null {
  const root = rootOf(o);
  if (!root) return null;
  // Usually the words are one piece of text: find it directly.
  const walker = document.createTreeWalker(root === document ? document.body : (root as Node), NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (el && norm(node.nodeValue).includes(want) && !el.closest('[data-coach]') && visible(el)) return el;
  }
  // Else the smallest element whose words, put together, contain it.
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.closest('[data-coach]') || !norm(el.textContent).includes(want) || !visible(el)) continue;
    if (Array.from(el.children).some((c) => norm(c.textContent).includes(want))) continue;
    return el;
  }
  return null;
}

/** The section (card or list) under the heading that contains `heading`. */
export const section = (heading: Words, o: Where = {}): Find => () => {
  const head = text(heading, o)();
  return head?.closest('section') || head || null;
};

/** The input, box or picker labelled `label` (the label's start is enough). */
export function input(label: Words, o: Where = {}): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  for (const one of wants(label)) {
    const el = inputOne(one, o);
    if (el) return el;
  }
  return null;
}
function inputOne(want: string, o: Where): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  const root = rootOf(o);
  if (!root) return null;
  for (const l of Array.from(root.querySelectorAll('label'))) {
    if (l.closest('[data-coach]') || !norm(l.textContent).startsWith(want) || !visible(l)) continue;
    const el = (l.htmlFor ? document.getElementById(l.htmlFor) : null) || l.querySelector('input,textarea,select');
    if (el && visible(el)) return el as HTMLInputElement;
  }
  // A box named only for screen readers (a row of boxes under one heading).
  for (const el of Array.from(root.querySelectorAll('input[aria-label],textarea[aria-label],select[aria-label]'))) {
    if (!el.closest('[data-coach]') && norm(el.getAttribute('aria-label')).startsWith(want) && visible(el)) return el as HTMLInputElement;
  }
  return null;
}

/** The field labelled `label`, with its label (what a "type here" step lights up). */
export const field = (label: Words, o: Where = {}): Find => () => {
  const el = input(label, o);
  if (!el) return null;
  // The label, the box and any note under it: the nearest wrapper holding both.
  const id = el.id;
  let box: Element | null = el.parentElement;
  while (box && box !== document.body && !(id && box.querySelector(`label[for="${id}"]`))) box = box.parentElement;
  return box && box !== document.body ? box : el;
};

/** Has the field labelled `label` got something in it (a money box's starting 0 doesn't count). */
export const filled = (label: Words, o: Where = {}) => () => {
  const value = input(label, o)?.value.trim() || '';
  return !!value && !/^[₹\s]*0+(\.0+)?$/.test(value);
};

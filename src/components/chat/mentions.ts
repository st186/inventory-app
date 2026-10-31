// @mentions in team chat (owner, 1 Nov 2026: "can we mention someone in chat?"): typing @ offers the
// room's people (and Everyone); the names picked are written as "@Name " and, when sent, become the
// message's mentions - who gets their own notification (server chat.ts).
export type Member = { user_id: string; name: string };
export const EVERYONE = 'Everyone';
/** Bunny (server chat.ts BUNNY_ID): only when named itself - @Everyone is for the people. */
export const BUNNY_ID = '00000000-0000-4000-8000-00000000b0b0';

/** The @word being typed just before the caret, if any: where it starts and what's typed after @. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret));
  return m ? { start: caret - m[2].length - 1, query: m[2] } : null;
}

/** The text with the @word replaced by "@Name ", and where the caret goes. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const before = text.slice(0, start), after = text.slice(caret).replace(/^\S*/, '');
  const add = `@${name} `;
  return { text: `${before}${add}${after.replace(/^\s+/, '')}`, caret: before.length + add.length };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Who the message mentions: each member written as "@Name" (whole name, any case), and everyone
 *  but the sender (and Bunny) for "@Everyone". */
export function mentionsIn(text: string, members: Member[], me: string | null): string[] {
  const out = new Set<string>();
  if (new RegExp(`(^|\\s)@${EVERYONE}(?![\\p{L}\\p{N}])`, 'iu').test(text)) members.forEach((m) => m.user_id !== me && m.user_id !== BUNNY_ID && out.add(m.user_id));
  for (const m of members) {
    if (m.user_id === me || !m.name.trim()) continue;
    if (new RegExp(`(^|\\s)@${esc(m.name.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text)) out.add(m.user_id);
  }
  return [...out];
}

/** The body cut into plain text and @mentions, to show the mentions highlighted. Longest names first,
 *  so "@Rohan Rajbanshi" isn't cut at "@Rohan". */
export function splitMentions(body: string, names: string[]): { text: string; mention: boolean }[] {
  const list = [...new Set([EVERYONE, ...names.map((n) => n.trim()).filter(Boolean)])].sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(?:${list.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > 0 && !/\s/.test(body[i - 1])) continue;
    if (i > last) out.push({ text: body.slice(last, i), mention: false });
    out.push({ text: m[0], mention: true });
    last = i + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

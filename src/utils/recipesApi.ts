// Calls for recipe capture (server recipes.ts) and the batches kept on the phone.
//
// A batch is filled over hours (ingredients in the morning, the 10 filling scoops at folding),
// often with no signal in the kitchen, so it lives on the phone as a draft (IndexedDB, the same
// store as the expense outbox, under its own "recipe-draft:" keys) until it is sent. The draft
// id is the batch's client id: it goes as the Idempotency-Key header and as `clientId` in the
// body, and the server saves under that id - a send whose answer was lost can be repeated and
// nothing is saved twice. Waiting drafts go by themselves when the signal comes back.
//
// Screens get the API from context, so the dev-only preview (recipes-preview.html) can run the
// same screens on mock data without signing in.
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { API_BASE, isNetworkError, newIdempotencyKey, onConnectivity, regionHeaders, requestJson } from './http';
import { currentAccessToken, currentAuthUserId } from './accessToken';
import { idbDelete, idbEntries, idbGet, idbSet } from './idbStore';
import type {
  Batch, BatchInput, CostCalc, Issue, MomoCost, PieceComponent, PiecePart, RecipeAccess, SheetStatus, SpreadFlag, StandardCalc, StandardDoc,
} from './recipeRules';
import type { PriceLink } from './priceRules';

export type TeamMember = { id: string; name: string; designation: string | null };
export type CrewMember = TeamMember & { picked: boolean };
export type SheetSummary = {
  sheetId: string;
  status: SheetStatus;
  active: number;
  lastAt: string | null;
  standard: { version: number; setAt: string; setByName: string; portionG: number | null; pickupG: number | null; yieldPct: number | null; outputG: number } | null;
};
export type PerMomo = { momoType: string; grams: Partial<Record<PiecePart, number | null>>; needs: string[]; cost?: MomoCost };
export type Overview = { access: RecipeAccess; today: string; sheets: SheetSummary[]; perMomo: PerMomo[]; team: TeamMember[]; crew: CrewMember[] | null; crewIds?: string[] };
export type SheetDetail = { sheetId: string; status: SheetStatus; batches: Batch[]; standard: StandardDoc | null; access: RecipeAccess; today: string };
export type Review = {
  sheetId: string;
  today: string;
  access: RecipeAccess;
  batches: Batch[];
  selected: string[];
  calc: StandardCalc | null;
  cost: CostCalc | null;
  batchCosts: { id: string; costPerKg: number | null }[];
  standard: StandardDoc | null;
  currentCost: { ok: true; costPerKg: number; pricesAsOf: string | null } | { ok: false; reason: string; missing: string[] } | null;
  status: SheetStatus;
  links: Record<string, PriceLink>;
};
export type CostsMap = Record<string, { costPerPiece: number; components: PieceComponent[]; standardVersion: string; pricesAsOf: string | null }>;
export type PriceItem = { key: string; name: string; count: number; lastDate: string; units: string[] };
export type SubmitAnswer = { batch: Batch; duplicate: boolean; photoError?: string };
export type ApiError = Error & { status?: number; details?: { error?: string; issues?: Issue[]; flags?: SpreadFlag[] } };

export interface RecipesApi {
  overview(): Promise<Overview>;
  sheet(sheetId: string): Promise<SheetDetail>;
  submitBatch(input: BatchInput, idempotencyKey: string): Promise<SubmitAnswer>;
  setBatchStatus(sheetId: string, batchId: string, status: 'active' | 'excluded', note: string): Promise<{ batch: Batch }>;
  review(sheetId: string, ids?: string[]): Promise<Review>;
  setStandard(sheetId: string, body: { batchIds: string[]; note: string; overrideReason?: string }): Promise<{ standard: StandardDoc }>;
  costs(): Promise<CostsMap>;
  saveCrew(crewIds: string[]): Promise<{ crewIds: string[] }>;
  priceItems(): Promise<{ items: PriceItem[] }>;
  savePriceLink(key: string, link: { itemKeys: string[]; gramsPerPiece: number | null }): Promise<{ key: string; link: PriceLink | null }>;
  photoUrl(sheetId: string, batchId: string): Promise<string>;
}

const call = <T>(path: string, init: RequestInit = {}, idempotencyKey?: string) =>
  requestJson<T>(`${API_BASE}${path}`, init, idempotencyKey ? { idempotencyKey } : {});
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const photoCache = new Map<string, Promise<string>>();

export const httpRecipesApi: RecipesApi = {
  overview: () => call('/recipes/overview'),
  sheet: (sheetId) => call(`/recipes/sheet/${encodeURIComponent(sheetId)}`),
  submitBatch: (input, key) => call('/recipes/batches', json('POST', { ...input, clientId: key }), key),
  setBatchStatus: (sheetId, batchId, status, note) =>
    call(`/recipes/batch/${encodeURIComponent(sheetId)}/${encodeURIComponent(batchId)}/status`, json('POST', { status, note }), newIdempotencyKey()),
  review: (sheetId, ids) => call(`/recipes/review/${encodeURIComponent(sheetId)}${ids?.length ? `?ids=${ids.map(encodeURIComponent).join(',')}` : ''}`),
  setStandard: (sheetId, body) => call(`/recipes/standards/${encodeURIComponent(sheetId)}`, json('POST', body), newIdempotencyKey()),
  costs: () => call('/recipes/costs'),
  saveCrew: (crewIds) => call('/recipes/crew', json('PUT', { crewIds })),
  priceItems: () => call('/recipes/price-items'),
  savePriceLink: (key, link) => call('/recipes/price-links', json('PUT', { key, ...link })),
  // Photos come through the server with the sign-in token (no public links).
  photoUrl: (sheetId, batchId) => {
    const path = `/recipes/photo/${encodeURIComponent(sheetId)}/${encodeURIComponent(batchId)}`;
    const hit = photoCache.get(path);
    if (hit) return hit;
    const p = (async () => {
      const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${await currentAccessToken()}`, ...regionHeaders() } });
      if (!res.ok) throw new Error('Could not load the photo');
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => photoCache.delete(path));
    photoCache.set(path, p);
    return p;
  },
};

const RecipesApiContext = createContext<RecipesApi>(httpRecipesApi);
export function RecipesApiProvider({ api, children }: { api: RecipesApi; children?: ReactNode }) {
  return createElement(RecipesApiContext.Provider, { value: api }, children);
}
export const useRecipesApi = () => useContext(RecipesApiContext);

// ---------------------------------------------------------------- drafts on the phone

export type DraftState = 'editing' | 'waiting' | 'sending' | 'failed';
export type Draft = {
  id: string; // = clientId = Idempotency-Key
  madeBy: string; // auth user id of the person filling it (only they see and send it)
  sheetId: string;
  input: BatchInput;
  state: DraftState;
  createdAt: number;
  updatedAt: number;
  error?: string;
  issues?: Issue[];
};

const PREFIX = 'recipe-draft:';
let drafts: Draft[] = [];
let snapshot: readonly Draft[] = [];
let loadedFor: string | null = null;
let ownerOverride: string | null = null;
const listeners = new Set<() => void>();
const sentListeners = new Set<(draft: Draft, answer: SubmitAnswer) => void>();
const sending = new Set<string>();

const ownerNow = () => ownerOverride || currentAuthUserId() || 'signed-out';
function notify() {
  snapshot = drafts.filter((d) => d.madeBy === ownerNow()).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const l of listeners) l();
}

/** The preview has no sign-in: drafts there belong to this name. */
export function setDraftOwner(owner: string | null) {
  ownerOverride = owner;
  loadedFor = null;
  void loadDrafts();
}

export async function loadDrafts(): Promise<void> {
  const owner = ownerNow();
  if (loadedFor === owner) return;
  loadedFor = owner;
  const rows = await idbEntries<Draft>('outbox', PREFIX);
  const fromDisk = rows.map(([, d]) => d).filter((d) => d && d.id && d.madeBy);
  const known = new Set(drafts.map((d) => d.id));
  drafts = [...drafts, ...fromDisk.filter((d) => !known.has(d.id))].map((d) => (d.state === 'sending' ? { ...d, state: 'waiting' as const } : d));
  notify();
}

export function newDraft(sheetId: string, input: BatchInput): Draft {
  const now = Date.now();
  return { id: input.clientId, madeBy: ownerNow(), sheetId, input, state: 'editing', createdAt: now, updatedAt: now };
}

export async function saveDraft(draft: Draft): Promise<void> {
  const next = { ...draft, updatedAt: Date.now() };
  drafts = [...drafts.filter((d) => d.id !== draft.id), next];
  notify();
  await idbSet('outbox', PREFIX + draft.id, next);
}

export async function removeDraft(id: string): Promise<void> {
  drafts = drafts.filter((d) => d.id !== id);
  notify();
  await idbDelete('outbox', PREFIX + id);
}

export const getDraft = (id: string) => drafts.find((d) => d.id === id) || null;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** This person's drafts, newest first. */
export function useDrafts(): readonly Draft[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
/** Called after a draft reaches the server (screens refresh their lists). */
export function onDraftSent(l: (draft: Draft, answer: SubmitAnswer) => void): () => void {
  sentListeners.add(l);
  return () => sentListeners.delete(l);
}

export type SendResult = { status: 'sent'; answer: SubmitAnswer } | { status: 'waiting' } | { status: 'failed'; error: string; issues?: Issue[] };

// One send. No signal or a server hiccup: it waits and goes again later (the id makes a repeat
// harmless). A refusal (missing weights, not on the crew) stops with the server's reason.
export async function sendDraft(api: RecipesApi, id: string): Promise<SendResult> {
  const draft = getDraft(id);
  if (!draft) return { status: 'failed', error: 'Draft not found' };
  if (sending.has(id)) return { status: 'waiting' };
  sending.add(id);
  await saveDraft({ ...draft, state: 'sending', error: undefined, issues: undefined });
  try {
    const answer = await api.submitBatch(draft.input, draft.id);
    await removeDraft(id);
    for (const l of sentListeners) l(draft, answer);
    return { status: 'sent', answer };
  } catch (e) {
    const err = e as ApiError;
    const status = err?.status ?? 0;
    if (isNetworkError(e) || !status || status >= 500 || status === 409) {
      await saveDraft({ ...draft, state: 'waiting' });
      return { status: 'waiting' };
    }
    const error = err.details?.error || err.message || 'Not sent';
    await saveDraft({ ...draft, state: 'failed', error, issues: err.details?.issues });
    return { status: 'failed', error, issues: err.details?.issues };
  } finally {
    sending.delete(id);
  }
}

export async function flushDrafts(api: RecipesApi): Promise<void> {
  await loadDrafts();
  for (const d of drafts.filter((x) => x.madeBy === ownerNow() && x.state === 'waiting')) await sendDraft(api, d.id);
}

let syncRefs = 0;
let stopSync: (() => void) | null = null;
/** Sends waiting batches now, when the signal comes back and every 30 s. App.tsx may call this
 *  once after sign-in so drafts also go while the Recipes screen is closed; screens call it too. */
export function startRecipeDraftSync(api: RecipesApi = httpRecipesApi): () => void {
  syncRefs++;
  if (!stopSync) {
    const offConn = onConnectivity((event) => { if (event !== 'offline') void flushDrafts(api); });
    const timer = setInterval(() => {
      if (drafts.some((d) => d.madeBy === ownerNow() && d.state === 'waiting')) void flushDrafts(api);
    }, 30_000);
    stopSync = () => { offConn(); clearInterval(timer); };
    void flushDrafts(api);
  }
  return () => {
    syncRefs = Math.max(0, syncRefs - 1);
    if (!syncRefs && stopSync) { stopSync(); stopSync = null; }
  };
}

// ---------------------------------------------------------------- last answers, for no signal

// The kitchen often has no signal: the last overview and sheet answers are kept on the phone
// (the per-person cache store, cleared at log out) so the lists and the "usual share" check still
// work offline.
const cacheKey = (name: string) => `recipes-cache:${encodeURIComponent(ownerNow())}:${name}`;
export async function readRecipesCache<T>(name: string): Promise<T | null> {
  const hit = await idbGet<{ at: number; data: T }>('cache', cacheKey(name));
  return hit ? hit.data : null;
}
export function writeRecipesCache(name: string, data: unknown): void {
  void idbSet('cache', cacheKey(name), { at: Date.now(), data });
}

export { newIdempotencyKey };

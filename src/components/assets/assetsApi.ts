// Calls to the Equipment & assets routes (server assets.ts). Kept here rather than in
// utils/api.ts so the register stays in its own files.
import { API_BASE } from '../../utils/api';
import { currentAccessToken } from '../../utils/accessToken';
import { getSupabaseClient } from '../../utils/supabase/client';
import type { Asset, AssetCategory, AssetCondition, AssetLocationKind } from '../../utils/assetRules';
import { regionHeaders } from '../../utils/http';

export type AssetRow = Asset & { photoUrl: string | null };
export interface AssetLocation { kind: AssetLocationKind; id: string; name: string }
export interface AssetPermissions {
  canEditAll: boolean;
  editableLocations: string[]; // "store:ID" / "production_house:ID"
  canDelete: boolean;
  canImport: boolean;
}
export interface AssetList {
  assets: AssetRow[];
  locations: AssetLocation[];
  permissions: AssetPermissions;
  lastReconcile: { at: string; added: number } | null;
}
export interface AssetInput {
  name?: string;
  category?: AssetCategory;
  quantity?: number;
  totalCost?: number | null;
  purchaseDate?: string | null;
  condition?: AssetCondition;
  notes?: string;
  locationKind?: AssetLocationKind;
  locationId?: string;
}
export interface ImportResult { added: number; updated: number; removed: number; skippedMissing: boolean }

export const locationKey = (kind: string, id: string) => `${kind}:${id}`;

async function call<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const token = await currentAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...regionHeaders(), ...(init?.headers || {}) },
  });
  // An access token that expired while the app sat in the background: refresh once and retry.
  if (res.status === 401 && !retried) {
    await getSupabaseClient().auth.refreshSession().catch(() => null);
    return call<T>(path, init, true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const listAssets = (includeDismissed = false) =>
  call<AssetList>(`/assets${includeDismissed ? '?includeDismissed=1' : ''}`);

export const createAssets = (items: AssetInput[]) =>
  call<{ assets: AssetRow[] }>('/assets', post({ items })).then((r) => r.assets);

export const updateAsset = (id: string, patch: AssetInput & { confirm?: boolean; resolveExpense?: 'accept' | 'keep'; removePhoto?: boolean }) =>
  call<{ asset: AssetRow }>(`/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }).then((r) => r.asset);

export const disposeAsset = (id: string, reason?: string) =>
  call<{ asset: AssetRow }>(`/assets/${encodeURIComponent(id)}/dispose`, post({ reason })).then((r) => r.asset);

export const dismissAsset = (id: string) =>
  call<{ asset: AssetRow }>(`/assets/${encodeURIComponent(id)}/dismiss`, post({})).then((r) => r.asset);

export const restoreAsset = (id: string) =>
  call<{ asset: AssetRow }>(`/assets/${encodeURIComponent(id)}/restore`, post({})).then((r) => r.asset);

export const deleteAsset = (id: string) =>
  call<{ success: boolean }>(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const uploadAssetPhoto = (id: string, image: string) =>
  call<{ asset: AssetRow }>(`/assets/${encodeURIComponent(id)}/photo`, post({ image })).then((r) => r.asset);

export const importPastPurchases = (fromDate: string) =>
  call<ImportResult>('/assets/import', post({ fromDate }));

// Phone photos are several MB: shrink to 1280 px JPEG (~200 KB) before sending, as the
// profile card does for Aadhaar photos.
export function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo - try again')); };
    img.src = url;
  });
}

export const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const shortDate = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

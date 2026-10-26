// Server-side mirror of src/constants/momoTypes.ts - edge functions can't import from
// src/, so this is a deliberate duplicate. Keep the two in sync; the frontend file is the
// source of truth. Only the fields the backend actually needs (no `label`/`color`).
export type MomoTypeGroup = 'regular' | 'kurkure';

export type MomoType = {
  key: string;
  inventoryKey: string;
  group: MomoTypeGroup;
  globalPoolField: 'dough' | 'batter';
  perTypePoolField: 'stuffing' | 'coating';
};

export const MOMO_TYPES: readonly MomoType[] = [
  { key: 'chickenMomos', inventoryKey: 'chicken', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing' },
  { key: 'chickenCheeseMomos', inventoryKey: 'chickenCheese', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing' },
  { key: 'vegMomos', inventoryKey: 'veg', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing' },
  { key: 'cheeseCornMomos', inventoryKey: 'cheeseCorn', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing' },
  { key: 'paneerMomos', inventoryKey: 'paneer', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing' },
  { key: 'vegKurkureMomos', inventoryKey: 'vegKurkure', group: 'kurkure', globalPoolField: 'batter', perTypePoolField: 'coating' },
  { key: 'chickenKurkureMomos', inventoryKey: 'chickenKurkure', group: 'kurkure', globalPoolField: 'batter', perTypePoolField: 'coating' },
] as const;

// Every distinct pool name across all momo types, deduped - used to size/iterate the
// production-ledger record's pool map without hand-listing 'dough'|'batter' separately.
export const GLOBAL_POOLS = ['dough', 'batter'] as const;

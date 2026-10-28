// No day's dough, stuffing, batter or coating comes near 100 kg, so a bigger figure is grams
// typed in a kg box (seven ledger entries by Oct 2026). The server refuses it too.
export const LEDGER_MAX_KG = 100;

export const looksLikeGrams = (raw: string | undefined): boolean => (parseFloat(raw || '') || 0) > LEDGER_MAX_KG;

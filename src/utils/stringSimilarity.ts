// Small self-contained similarity check for catching near-duplicate item names
// (e.g. "Chili chicken masala" vs "Chilli chicken masala"). No external dependency.

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

// 1.0 = identical, 0.0 = completely different
export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeItemName(a);
  const normB = normalizeItemName(b);
  if (normA === normB) return 1;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(normA, normB) / maxLen;
}

// Calibrated against real data: 0.95 similarity caught a genuine duplicate
// ("Chili chicken masala" vs "Chilli chicken masala"), 0.83 was a false positive
// ("Green chilli sauce" vs "Red chilli sauce" — different items). 0.90 sits safely between.
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.9;

export type SimilarItemMatch<T> = { match: T; similarity: number; exact: boolean };

// Finds the closest existing item to a candidate name, if any, above the threshold.
// Exact normalized matches always trigger regardless of category (catches the same
// item name filed under two different categories by mistake).
export function findSimilarItem<T>(
  candidateName: string,
  existingItems: T[],
  getName: (item: T) => string,
  threshold: number = DUPLICATE_SIMILARITY_THRESHOLD
): SimilarItemMatch<T> | null {
  let best: SimilarItemMatch<T> | null = null;
  for (const item of existingItems) {
    const similarity = stringSimilarity(candidateName, getName(item));
    const exact = normalizeItemName(candidateName) === normalizeItemName(getName(item));
    if (exact || similarity >= threshold) {
      if (!best || similarity > best.similarity) {
        best = { match: item, similarity, exact };
      }
    }
  }
  return best;
}

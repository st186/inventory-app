// Suppress benign Supabase warnings in development
const originalWarn = console.warn;

console.warn = function(...args) {
  // Suppress the multiple GoTrueClient instances warning
  // This is a known issue in development mode with HMR and is safe to ignore
  if (args[0]?.includes?.('Multiple GoTrueClient instances detected')) {
    return;
  }
  originalWarn.apply(console, args);
};

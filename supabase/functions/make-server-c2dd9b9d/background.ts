// Work after the reply: an AI look at photos takes 10-40 s and nobody should stand there waiting
// (owner, 28 Oct 2026: upload first, analyse after, tell them when it's ready). EdgeRuntime.waitUntil
// keeps the server copy alive until the work is done; where it doesn't exist the work is awaited.
// Failures are logged, never thrown - the save itself has already succeeded.
export function inBackground(label: string, work: () => Promise<unknown>): Promise<void> {
  const task = Promise.resolve().then(work).then(() => undefined, (err) => console.log(`${label} failed:`, String((err as any)?.message || err).slice(0, 160)));
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') { runtime.waitUntil(task); return Promise.resolve(); }
  return task;
}

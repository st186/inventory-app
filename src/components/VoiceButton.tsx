import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { cancelListening, startListening, stopListening, voiceSupported } from '../utils/voice';
import { BUNNY_LANGUAGES, speechLocale, useBunnyLanguage } from '../utils/bunnyLanguage';
import { cn } from './ui/utils';

// Mic button used by the Bunny chat, Quick Add expense and the sales cash count. Tap to start,
// talk with as many pauses as needed, tap again (or "Done") to finish - the words show live in
// a bar at the bottom of the screen and go to onText at the end. Speaks the person's Bunny
// language; the small chip beside it switches language and remembers the choice.
//
// variant="button" (default): a 36 px secondary button with the mic and an optional label.
// variant="row": the big "Say it instead" row at the top of a form sheet, with the example
// sentence (`prompt`) under the label.
const MAX_LISTEN_MS = 3 * 60 * 1000;

export function VoiceButton({ onText, prompt, busy = false, label, className = '', variant = 'button' }: {
  onText: (text: string) => void | Promise<void>;
  prompt?: string; // an example sentence, shown in the row variant and the listening bar
  busy?: boolean; // the caller is still working on the last thing said
  label?: string; // text beside the mic; icon only when left out
  className?: string;
  variant?: 'button' | 'row';
}) {
  const [lang, setLang] = useBunnyLanguage();
  const [listening, setListening] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [live, setLive] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); cancelListening(); }, []);
  if (!voiceSupported()) return null;

  const nothingHeard = () => toast.info(lang === 'bn' ? 'কিছু শোনা যায়নি - আবার বলুন' : lang === 'hi' ? 'कुछ सुनाई नहीं दिया - फिर से बोलें' : 'Nothing heard - try again');

  const finish = async () => {
    if (timer.current) clearTimeout(timer.current);
    setFinishing(true);
    try {
      const text = (await stopListening()) || live;
      setListening(false);
      setLive('');
      if (text.trim()) await onText(text.trim());
      else nothingHeard();
    } catch (e: any) {
      toast.error(e?.message || 'Voice input failed');
      setListening(false);
    } finally {
      setFinishing(false);
    }
  };

  const start = async () => {
    if (listening) return finish();
    setLive('');
    try {
      await startListening(speechLocale(lang), setLive, (message) => { toast.error(message); setListening(false); });
      setListening(true);
      timer.current = setTimeout(finish, MAX_LISTEN_MS);
    } catch (e: any) {
      toast.error(e?.message || 'Voice input failed');
    }
  };

  const cancel = async () => {
    if (timer.current) clearTimeout(timer.current);
    await cancelListening();
    setListening(false);
    setLive('');
  };

  const index = BUNNY_LANGUAGES.findIndex((l) => l.id === lang);
  const next = BUNNY_LANGUAGES[(index + 1) % BUNNY_LANGUAGES.length];
  const chip = lang === 'bn' ? 'বাং' : lang === 'hi' ? 'हिं' : 'EN';
  const tapToFinish = lang === 'bn' ? 'শেষ হলে চাপুন' : lang === 'hi' ? 'बोलकर दबाएँ' : 'Tap to finish';
  const working = busy || finishing;

  const languageChip = !listening && (
    <button
      type="button"
      onClick={() => setLang(next.id)}
      disabled={busy}
      className="hit-44 min-h-0 min-w-11 shrink-0 border-l border-border px-2 text-caption font-semibold text-text-2 outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
      aria-label={`Voice language ${BUNNY_LANGUAGES[index].label} - tap for ${next.label}`}
      title={`Switch to ${next.label}`}
      lang={lang}
    >
      {chip}
    </button>
  );

  return (
    <>
      {variant === 'row' ? (
        <span
          className={cn(
            'flex w-full items-stretch overflow-hidden rounded-lg border border-dashed bg-surface',
            listening ? 'border-primary bg-primary-soft' : 'border-border-strong',
            className,
          )}
        >
          <button
            type="button"
            onClick={start}
            disabled={working}
            className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
            aria-label={listening ? tapToFinish : label || 'Speak'}
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
              {working ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body-md font-semibold text-text">{busy ? 'Reading...' : listening ? tapToFinish : label || 'Say it instead'}</span>
              {prompt && !listening && <span className="truncate text-label text-text-3" lang={lang}>{prompt}</span>}
            </span>
          </button>
          {languageChip}
        </span>
      ) : (
        <span
          className={cn(
            'inline-flex h-9 items-stretch overflow-hidden rounded-sm border',
            listening ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface',
            className,
          )}
        >
          <button
            type="button"
            onClick={start}
            disabled={working}
            className={cn(
              'hit-44 inline-flex min-h-0 min-w-11 items-center justify-center gap-1.5 px-3 text-label font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60',
              listening ? 'text-primary' : 'text-text hover:bg-surface-2',
            )}
            aria-label={listening ? tapToFinish : label || 'Speak'}
          >
            {working ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            {(label || listening) && <span lang={lang}>{busy ? 'Reading...' : listening ? tapToFinish : label}</span>}
          </button>
          {languageChip}
        </span>
      )}

      {listening && (
        <div className="fixed inset-x-0 bottom-0 z-(--z-toast) p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4" role="status" aria-live="polite">
          <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-4 text-text shadow-e3">
            <div className="flex items-center gap-2 text-label font-semibold text-primary" lang={lang}>
              <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
              {lang === 'bn' ? 'শুনছি… থেমে থেমে বলুন, শেষ হলে Done চাপুন' : lang === 'hi' ? 'सुन रहा हूँ… रुक-रुककर बोलें, ख़त्म होने पर Done दबाएँ' : 'Listening… pause as you like, tap Done when finished'}
            </div>
            <p className="mt-2 max-h-40 min-h-12 overflow-y-auto text-body" lang={lang}>
              {live || <span className="text-text-3">{prompt || '…'}</span>}
            </p>
            <div className="mt-3 flex gap-2.5">
              <button type="button" onClick={cancel} className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface text-body-md font-semibold text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-5" aria-hidden="true" /> Cancel
              </button>
              <button type="button" onClick={finish} disabled={finishing} className="inline-flex h-12 flex-[2] items-center justify-center gap-1.5 rounded-md bg-primary text-body-md font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60">
                {finishing ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />} Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

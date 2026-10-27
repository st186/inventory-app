import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, X } from 'lucide-react';
import { toast } from 'sonner';
import { cancelListening, startListening, stopListening, voiceSupported } from '../utils/voice';
import { BUNNY_LANGUAGES, speechLocale, useBunnyLanguage } from '../utils/bunnyLanguage';

// Mic button used by the Bunny chat, Quick Add expense and the sales cash count. Tap to start,
// talk with as many pauses as needed, tap again (or "Done") to finish - the words show live in
// a bar at the bottom of the screen and go to onText at the end. Speaks the person's Bunny
// language (set on Home); the small chip beside it switches language and remembers the choice.
const MAX_LISTEN_MS = 3 * 60 * 1000;

export function VoiceButton({ onText, busy = false, label, className = '' }: {
  onText: (text: string) => void | Promise<void>;
  prompt?: string; // an example sentence, shown in the listening bar
  busy?: boolean; // the caller is still working on the last thing said
  label?: string; // text beside the mic; icon only when left out
  className?: string;
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

  return (
    <>
      <span className={`inline-flex items-stretch rounded-xl border overflow-hidden ${listening ? 'border-rose-400 bg-rose-50' : 'border-violet-300 bg-white'} ${className}`}>
        <button
          type="button"
          onClick={start}
          disabled={busy || finishing}
          className={`px-3 py-2 inline-flex items-center gap-1.5 text-sm font-semibold disabled:opacity-60 ${listening ? 'text-rose-700' : 'text-violet-700 hover:bg-violet-50'}`}
          aria-label={listening ? tapToFinish : label || 'Speak'}
        >
          {busy || finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className={`w-4 h-4 ${listening ? 'animate-pulse' : ''}`} />}
          {(label || listening) && <span>{busy ? 'Reading...' : listening ? tapToFinish : label}</span>}
        </button>
        {!listening && (
          <button
            type="button"
            onClick={() => setLang(next.id)}
            disabled={busy}
            className="px-2 border-l border-violet-200 text-[11px] font-semibold text-violet-600 hover:bg-violet-50"
            aria-label={`Voice language ${BUNNY_LANGUAGES[index].label} - tap for ${next.label}`}
            title={`Switch to ${next.label}`}
          >
            {chip}
          </button>
        )}
      </span>

      {listening && (
        <div className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4" role="status" aria-live="polite">
          <div className="max-w-lg mx-auto rounded-2xl bg-gray-900 text-white shadow-2xl p-4">
            <div className="flex items-center gap-2 text-xs text-rose-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> {lang === 'bn' ? 'শুনছি… থেমে থেমে বলুন, শেষ হলে Done চাপুন' : lang === 'hi' ? 'सुन रहा हूँ… रुक-रुककर बोलें, ख़त्म होने पर Done दबाएँ' : 'Listening… pause as you like, tap Done when finished'}
            </div>
            <p className="mt-2 text-base min-h-[3rem] max-h-40 overflow-y-auto">{live || <span className="text-gray-400">…</span>}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={cancel} className="flex-1 py-2.5 rounded-xl bg-white/10 text-sm font-semibold inline-flex items-center justify-center gap-1.5"><X className="w-4 h-4" /> Cancel</button>
              <button type="button" onClick={finish} disabled={finishing} className="flex-[2] py-2.5 rounded-xl bg-emerald-500 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
                {finishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

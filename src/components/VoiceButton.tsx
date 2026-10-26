import { useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { listen, voiceSupported } from '../utils/voice';
import { BUNNY_LANGUAGES, speechLocale, useBunnyLanguage } from '../utils/bunnyLanguage';

// Mic button used by the Bunny chat, Quick Add expense and the sales cash count. Tap, speak in the
// person's Bunny language (set on Home), and the words go to onText. The small chip beside it
// switches language (Bengali -> English -> Hindi) and remembers the choice.
export function VoiceButton({ onText, prompt, busy = false, label, className = '' }: {
  onText: (text: string) => void | Promise<void>;
  prompt?: string; // shown on the phone's speech screen, e.g. an example sentence
  busy?: boolean; // the caller is still working on the last thing said
  label?: string; // text beside the mic; icon only when left out
  className?: string;
}) {
  const [lang, setLang] = useBunnyLanguage();
  const [listening, setListening] = useState(false);
  if (!voiceSupported()) return null;

  const start = async () => {
    setListening(true);
    try {
      const text = await listen(speechLocale(lang), prompt);
      if (text) await onText(text);
      else toast.info(lang === 'bn' ? 'কিছু শোনা যায়নি - আবার বলুন' : lang === 'hi' ? 'कुछ सुनाई नहीं दिया - फिर से बोलें' : 'Nothing heard - try again');
    } catch (e: any) {
      toast.error(e?.message || 'Voice input failed');
    } finally {
      setListening(false);
    }
  };
  const index = BUNNY_LANGUAGES.findIndex((l) => l.id === lang);
  const next = BUNNY_LANGUAGES[(index + 1) % BUNNY_LANGUAGES.length];
  const working = listening || busy;
  const chip = lang === 'bn' ? 'বাং' : lang === 'hi' ? 'हिं' : 'EN';

  return (
    <span className={`inline-flex items-stretch rounded-xl border border-violet-300 bg-white overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={start}
        disabled={working}
        className="px-3 py-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
        aria-label={label || 'Speak'}
      >
        {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
        {label && <span>{busy ? 'Reading...' : listening ? 'Listening...' : label}</span>}
      </button>
      <button
        type="button"
        onClick={() => setLang(next.id)}
        disabled={working}
        className="px-2 border-l border-violet-200 text-[11px] font-semibold text-violet-600 hover:bg-violet-50"
        aria-label={`Voice language ${BUNNY_LANGUAGES[index].label} - tap for ${next.label}`}
        title={`Switch to ${next.label}`}
      >
        {chip}
      </button>
    </span>
  );
}

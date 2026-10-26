import { useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { getVoiceLanguage, listen, setVoiceLanguage, voiceSupported, type VoiceLanguage } from '../utils/voice';

// Mic button used by Ask Bunny, Quick Add expense and the sales cash count. Tap, speak (Bengali by
// default, or English), and the words go to onText. The small chip beside it switches language.
export function VoiceButton({ onText, prompt, busy = false, label, className = '' }: {
  onText: (text: string) => void | Promise<void>;
  prompt?: string; // shown on the phone's speech screen, e.g. an example sentence
  busy?: boolean; // the caller is still working on the last thing said
  label?: string; // text beside the mic; icon only when left out
  className?: string;
}) {
  const [lang, setLang] = useState<VoiceLanguage>(getVoiceLanguage);
  const [listening, setListening] = useState(false);
  if (!voiceSupported()) return null;

  const start = async () => {
    setListening(true);
    try {
      const text = await listen(lang, prompt);
      if (text) await onText(text);
      else toast.info(lang === 'bn-IN' ? 'কিছু শোনা যায়নি - আবার বলুন' : 'Nothing heard - try again');
    } catch (e: any) {
      toast.error(e?.message || 'Voice input failed');
    } finally {
      setListening(false);
    }
  };
  const toggleLang = () => {
    const next: VoiceLanguage = lang === 'bn-IN' ? 'en-IN' : 'bn-IN';
    setLang(next);
    setVoiceLanguage(next);
  };
  const working = listening || busy;

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
        onClick={toggleLang}
        disabled={working}
        className="px-2 border-l border-violet-200 text-[11px] font-semibold text-violet-600 hover:bg-violet-50"
        aria-label={`Voice language: ${lang === 'bn-IN' ? 'Bengali' : 'English'} - tap to switch`}
        title="Switch voice language"
      >
        {lang === 'bn-IN' ? 'বাং' : 'EN'}
      </button>
    </span>
  );
}

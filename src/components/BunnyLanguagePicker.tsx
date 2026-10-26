import { Languages } from 'lucide-react';
import { BUNNY_LANGUAGES, useBunnyLanguage } from '../utils/bunnyLanguage';

// Home screen (above the leaves card): the language Bunny uses with this person - what the mic
// listens for, the language of AI explanations and the voice that reads them aloud.
export function BunnyLanguagePicker() {
  const [lang, setLang] = useBunnyLanguage();
  return (
    <div className="w-full mb-3 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 to-white p-3 sm:p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-600 flex items-center justify-center flex-shrink-0"><Languages className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm">Bunny's language</p>
          <p className="text-xs text-gray-500">For voice, AI explanations and read-aloud · ভয়েস ও উত্তরের ভাষা</p>
        </div>
      </div>
      <div className="flex gap-1.5" role="group" aria-label="Bunny's language">
        {BUNNY_LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLang(l.id)}
            aria-pressed={lang === l.id}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${lang === l.id ? 'bg-violet-600 text-white' : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

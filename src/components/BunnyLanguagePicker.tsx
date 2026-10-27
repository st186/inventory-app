import { BUNNY_LANGUAGES, useBunnyLanguage, type BunnyLanguage } from '../utils/bunnyLanguage';

// Home screen (above the leaves card): the language Bunny uses with this person - what the mic
// listens for, the language of AI explanations and the voice that reads them aloud.
// Compact on purpose: a one-line header and a three-way switch, so it stays small even with
// large phone text sizes. The hint is shown in the chosen language only.
const HINT: Record<BunnyLanguage, string> = {
  en: 'Voice, answers and read-aloud',
  bn: 'ভয়েস, উত্তর আর পড়ে শোনানোর ভাষা',
  hi: 'आवाज़, जवाब और पढ़कर सुनाने की भाषा',
};

export function BunnyLanguagePicker() {
  const [lang, setLang] = useBunnyLanguage();
  return (
    <div className="w-full mb-3 rounded-2xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-full bg-violet-50 ring-1 ring-violet-200 flex items-center justify-center flex-shrink-0">
          <img src="/bunny-logo.png" alt="" className="w-7 h-7 object-contain" draggable={false} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">Bunny's language</p>
          <p className="text-xs text-gray-500 truncate" lang={lang}>{HINT[lang]}</p>
        </div>
      </div>
      <div role="radiogroup" aria-label="Bunny's language" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 sm:w-80 flex-shrink-0">
        {BUNNY_LANGUAGES.map((l) => {
          const on = lang === l.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={on}
              lang={l.id}
              onClick={() => setLang(l.id)}
              className={`min-h-[40px] px-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${on ? 'bg-white text-violet-700 shadow-sm ring-1 ring-violet-200' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

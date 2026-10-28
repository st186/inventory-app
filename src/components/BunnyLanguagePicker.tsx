import { APP_LANGUAGES, useAppLanguage, type AppLanguage } from '../utils/appLanguage';
import { BUNNY_LANGUAGES, useBunnyLanguage, type BunnyLanguage } from '../utils/bunnyLanguage';
import { SegmentedControl } from './ui/segmented-control';
import { useT } from '../utils/i18n';

// The two language settings, both in the Account sheet (owner, 27 Oct 2026):
//   App language     - the app's own words (menus, buttons, status words): utils/appLanguage.ts
//   Bunny's language - what the mic listens for, AI answers and read-aloud: utils/bunnyLanguage.ts
// A card with a one-line header and a three-way switch, each option in its own script.

export function LanguagePicker({ kind }: { kind: 'app' | 'bunny' }) {
  const { t } = useT();
  const [appLang, setAppLang] = useAppLanguage();
  const [bunnyLang, setBunnyLang] = useBunnyLanguage();
  const isApp = kind === 'app';
  const title = isApp ? t('account.appLanguage') : t('account.bunnyLanguage');
  const options = (isApp ? APP_LANGUAGES : BUNNY_LANGUAGES).map((l) => ({ value: l.id, label: l.label, lang: l.id }));
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface px-4 py-3.5" aria-label={title}>
      <div className="flex items-center gap-2.5">
        {!isApp && <img src="/bunny-logo.png" alt="" className="size-7 shrink-0 object-contain" draggable={false} />}
        <div className="flex min-w-0 flex-col">
          <span className="text-body-md font-medium text-text">{title}</span>
          <span className="text-label text-text-3">{isApp ? t('account.appLanguageHint') : t('account.bunnyLanguageHint')}</span>
        </div>
      </div>
      {isApp ? (
        <SegmentedControl<AppLanguage> aria-label={title} value={appLang} onValueChange={setAppLang} options={options} selectedTone="primary" />
      ) : (
        <SegmentedControl<BunnyLanguage> aria-label={title} value={bunnyLang} onValueChange={setBunnyLang} options={options} selectedTone="primary" />
      )}
    </section>
  );
}

/** Bunny's language on its own (Analytics still shows it until WP2 removes it from there). */
export function BunnyLanguagePicker() {
  return (
    <div className="mb-3">
      <LanguagePicker kind="bunny" />
    </div>
  );
}

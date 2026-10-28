import { SegmentedControl } from '../ui/segmented-control';
import { useT } from '../../utils/i18n';
import { useThemeChoice, type ThemeChoice } from '../../utils/appTheme';

// Light, dark or the phone's own setting (utils/appTheme.ts), in the Account sheet under the
// language cards and built the same way.
export function ThemePicker() {
  const { t } = useT();
  const [choice, setChoice] = useThemeChoice();
  const title = t('account.theme');
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface px-4 py-3.5" aria-label={title}>
      <div className="flex min-w-0 flex-col">
        <span className="text-body-md font-medium text-text">{title}</span>
        <span className="text-label text-text-3">{t('account.themeHint')}</span>
      </div>
      <SegmentedControl<ThemeChoice>
        aria-label={title}
        value={choice}
        onValueChange={setChoice}
        selectedTone="primary"
        options={[
          { value: 'light', label: t('account.themeLight') },
          { value: 'dark', label: t('account.themeDark') },
          { value: 'system', label: t('account.themeSystem') },
        ]}
      />
    </section>
  );
}

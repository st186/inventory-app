// Dev-only (recipes-preview.html): the recipe screens on made-up data, switchable by role,
// language and screen, without signing in. Not part of the production build.
import * as React from 'react';

import { ConfirmProvider } from '../../ui/confirm';
import { SegmentedControl } from '../../ui/segmented-control';
import { Switch } from '../../ui/switch';
import { LanguageOverride, type Lang } from '../../../utils/i18n';
import { RecipesApiProvider, setDraftOwner } from '../../../utils/recipesApi';
import { RecipesPage } from '../RecipesPage';
import { RecipesReviewPage } from '../RecipesReviewPage';
import { createMockRecipesApi, type PreviewRole } from './mockApi';

type Screen = 'production' | 'more';

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const lang = p.get('lang');
  const role = p.get('role');
  const screen = p.get('screen');
  return {
    lang: (lang === 'bn' || lang === 'hi' ? lang : 'en') as Lang,
    role: (role === 'crew' || role === 'ops' || role === 'owner' ? role : 'head') as PreviewRole,
    screen: (screen === 'more' ? 'more' : 'production') as Screen,
    chrome: p.get('chrome') !== '0',
  };
}

const mock = createMockRecipesApi();

export function PreviewApp() {
  const initial = React.useMemo(readParams, []);
  const [lang, setLang] = React.useState<Lang>(initial.lang);
  const [role, setRole] = React.useState<PreviewRole>(initial.role);
  const [screen, setScreen] = React.useState<Screen>(initial.screen);
  const [offline, setOffline] = React.useState(false);
  const [version, setVersion] = React.useState(0);

  React.useEffect(() => {
    mock.setRole(role);
    setDraftOwner(`preview-${role}`);
    setVersion((v) => v + 1);
  }, [role]);
  React.useEffect(() => { mock.setOffline(offline); setVersion((v) => v + 1); }, [offline]);
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('lang', lang); p.set('role', role); p.set('screen', screen);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [lang, role, screen]);

  return (
    <div className="min-h-dvh bg-bg text-text">
      {initial.chrome && (
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-subtitle font-semibold">Recipes preview</span>
              <span className="text-caption text-text-3">Dev only · made-up data, nothing is saved</span>
            </div>
            <SegmentedControl<Screen> aria-label="Screen" size="sm" value={screen} onValueChange={setScreen} className="w-full sm:w-72"
              options={[{ value: 'production', label: 'Production → Recipes' }, { value: 'more', label: 'More → Costs' }]} />
            <SegmentedControl<PreviewRole> aria-label="Role" size="sm" value={role} onValueChange={setRole} className="w-full sm:w-72"
              options={[{ value: 'head', label: 'Head' }, { value: 'crew', label: 'Crew' }, { value: 'ops', label: 'Ops' }, { value: 'owner', label: 'Owner' }]} />
            <SegmentedControl<Lang> aria-label="Language" size="sm" selectedTone="primary" value={lang} onValueChange={setLang} className="w-full sm:w-56"
              options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা', lang: 'bn' }, { value: 'hi', label: 'हिन्दी', lang: 'hi' }]} />
            <label className="flex items-center gap-2 text-label text-text-2">
              <Switch checked={offline} onCheckedChange={setOffline} aria-label="No signal" />
              No signal
            </label>
          </div>
        </header>
      )}
      <LanguageOverride lang={lang}>
        <ConfirmProvider>
          <RecipesApiProvider api={mock.api}>
            <div lang={lang} key={`${screen}-${role}-${version}`}>
              {screen === 'production'
                ? <RecipesPage header employeeId={role === 'head' ? 'PV-01' : role === 'crew' ? 'PV-11' : null} />
                : <RecipesReviewPage />}
            </div>
          </RecipesApiProvider>
        </ConfirmProvider>
      </LanguageOverride>
    </div>
  );
}

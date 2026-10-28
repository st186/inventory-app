// One-tap links to the day's main places for this login, built from the navigation. The Home
// screens now lead with their checklist / attention list instead; the shell's role preview still
// lists these under its Home placeholder.
import { ListGroup, ListRow } from '../ui/list-row';
import { useT } from '../../utils/i18n';
import { useShell } from '../shell/ShellContext';
import { NAV_ICONS } from '../shell/icons';

export function HomeShortcuts({ extra = [] }: { extra?: string[] }) {
  const { nav, router } = useShell();
  const { t } = useT();
  const paths = [
    ...nav.tabs.filter((tab) => !['home', 'more', 'me'].includes(tab.path)).map((tab) => tab.subs[0] ?? tab.path),
    ...extra,
  ].filter((path, i, all) => !!nav.destinations[path] && all.indexOf(path) === i);
  if (paths.length === 0) return null;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <ListGroup title={t('home.shortcuts')}>
        {paths.map((path) => {
          const dest = nav.destinations[path];
          return <ListRow key={path} icon={NAV_ICONS[dest.icon]} title={t(dest.label)} onClick={() => router.go(path)} />;
        })}
      </ListGroup>
    </div>
  );
}

/** True when Home was opened from Account > Complete your profile (#/home?focus=profile): Home then opens the profile sheet. */
export function useFocusProfile(): boolean {
  const { router } = useShell();
  return router.route.params.focus === 'profile';
}

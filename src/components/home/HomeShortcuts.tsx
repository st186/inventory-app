// Stub (WP0b): one-tap links to the day's main places for this login, built from the navigation,
// until WP1 replaces the Home screens with the "Today" checklist and attention list.
import { useEffect, useRef } from 'react';
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

/** Scrolls the profile card into view when Home opens from Account > Complete your profile. */
export function useFocusProfile() {
  const { router } = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const focus = router.route.params.focus;
  useEffect(() => {
    if (focus !== 'profile') return;
    const timer = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => clearTimeout(timer);
  }, [focus]);
  return ref;
}

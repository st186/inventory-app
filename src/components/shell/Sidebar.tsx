// Desktop navigation (>= 1024 px): a 248 px sidebar with the logo, the store switcher (owner, more
// than one store), the same destinations as the bottom nav with the open one's sub-pages listed
// under it, and the account at the bottom.
import type { ReactNode } from 'react';
import type { NavModel } from './navConfig';
import { NAV_ICONS } from './icons';
import { NavBadge } from './BottomNav';
import { InitialsAvatar } from '../ui/avatar';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';

export function Sidebar({
  nav,
  activeTab,
  currentPath,
  badges,
  onSelectTab,
  onSelectPage,
  storeSwitcher,
  userName,
  roleLine,
  onAccount,
}: {
  nav: NavModel;
  activeTab: string | null;
  currentPath: string;
  badges: Partial<Record<string, number>>;
  onSelectTab: (path: string) => void;
  /** A sub-tab of the open tab (replace) or a More / Me row (push). */
  onSelectPage: (path: string, kind: 'sub' | 'more') => void;
  storeSwitcher?: ReactNode;
  userName: string;
  roleLine: string;
  onAccount: () => void;
}) {
  const { t } = useT();
  return (
    <aside className="fixed inset-y-0 left-0 z-(--z-nav) hidden w-[248px] flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
        <img src="/bunny-logo.png" alt="" className="size-8 object-contain" draggable={false} />
        <span className="text-subtitle font-semibold text-text">Bunny Momos</span>
      </div>
      {storeSwitcher && <div className="border-b border-border px-3 py-3">{storeSwitcher}</div>}
      <nav aria-label={t('nav.main')} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-0.5">
          {nav.tabs.map((tab) => {
            const Icon = NAV_ICONS[tab.icon];
            const on = tab.path === activeTab;
            const count = tab.badge ? badges[tab.badge] || 0 : 0;
            const isList = tab.path === 'more' || tab.path === 'me';
            return (
              <li key={tab.path}>
                <button
                  type="button"
                  onClick={() => onSelectTab(tab.path)}
                  aria-current={on && (currentPath === tab.path || tab.subs.length === 0) ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-body-md outline-none',
                    'transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring',
                    on ? 'bg-primary-soft font-semibold text-primary' : 'font-medium text-text-2 hover:bg-surface-2 hover:text-text',
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t(tab.label)}</span>
                  {count > 0 && <NavBadge count={count} className="static" />}
                </button>
                {on && tab.subs.length > 1 && (
                  <ul className="mt-0.5 mb-1 flex flex-col gap-0.5 pl-11">
                    {tab.subs.map((path) => (
                      <SubItem key={path} label={t(nav.destinations[path].label)} on={currentPath === path} onClick={() => onSelectPage(path, 'sub')} />
                    ))}
                  </ul>
                )}
                {on && isList && nav.more.length > 0 && (
                  <div className="mt-1 mb-1 flex flex-col gap-2 pl-11">
                    {nav.more.map((group) => (
                      <div key={group.title}>
                        <p className="overline-label px-2 pt-1 pb-1">{t(group.title)}</p>
                        <ul className="flex flex-col gap-0.5">
                          {group.items.map((path) => (
                            <SubItem key={path} label={t(nav.destinations[path].label)} on={currentPath === path} onClick={() => onSelectPage(path, 'more')} />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={onAccount}
        className="flex shrink-0 items-center gap-3 border-t border-border px-4 py-3 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <InitialsAvatar name={userName} size={40} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body-md font-semibold text-text">{userName}</span>
          <span className="truncate text-label text-text-3">{roleLine}</span>
        </span>
      </button>
    </aside>
  );
}

function SubItem({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'flex min-h-11 w-full items-center rounded-md px-2 text-left text-body-sm outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          on ? 'font-semibold text-primary' : 'font-medium text-text-2 hover:bg-surface-2 hover:text-text',
        )}
      >
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}

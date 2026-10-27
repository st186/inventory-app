// Tablet navigation (768-1023 px): an 80 px rail with the same tabs, labels under the icons.
import { NAV_ICONS } from './icons';
import { NavBadge, type NavItemProps } from './BottomNav';
import { InitialsAvatar } from '../ui/avatar';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';

export function NavRail({ tabs, activeTab, badges, onSelect, userName, onAccount }: NavItemProps & { userName: string; onAccount: () => void }) {
  const { t } = useT();
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-y-0 left-0 z-(--z-nav) hidden w-20 flex-col items-center border-r border-border bg-surface py-3 md:flex lg:hidden"
    >
      <img src="/bunny-logo.png" alt="Bunny Momos" className="mb-4 size-9 object-contain" draggable={false} />
      <ul className="flex w-full flex-1 flex-col items-center gap-1">
        {tabs.map((tab) => {
          const Icon = NAV_ICONS[tab.icon];
          const on = tab.path === activeTab;
          const count = tab.badge ? badges[tab.badge] || 0 : 0;
          const label = t(tab.label);
          return (
            <li key={tab.path} className="w-full">
              <button
                type="button"
                onClick={() => onSelect(tab.path)}
                aria-current={on ? 'page' : undefined}
                aria-label={count ? `${label}, ${t('common.newCount', { n: count })}` : label}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 text-caption outline-none',
                  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  on ? 'font-semibold text-primary' : 'font-medium text-text-2 hover:text-text',
                )}
              >
                <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full', on && 'bg-primary-soft')}>
                  <Icon className="size-6" aria-hidden="true" />
                  <NavBadge count={count} className="-top-1 right-1" />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onAccount}
        aria-label={t('account.yours')}
        className="flex size-11 items-center justify-center rounded-full outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <InitialsAvatar name={userName} size={32} />
      </button>
    </nav>
  );
}

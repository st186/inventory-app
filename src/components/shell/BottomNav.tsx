// Phone navigation (< 768 px): at most five tabs, labels always shown, the active tab's icon on a
// 56 x 32 primary-soft pill, a count badge where something waits for approval.
import type { NavTab } from './navConfig';
import { NAV_ICONS } from './icons';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';

export type NavItemProps = {
  tabs: NavTab[];
  activeTab: string | null;
  badges: Partial<Record<string, number>>;
  onSelect: (path: string) => void;
};

export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'num pointer-events-none absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-caption font-semibold leading-[18px] text-on-danger',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function BottomNav({ tabs, activeTab, badges, onSelect }: NavItemProps) {
  const { t } = useT();
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-(--z-nav) border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16">
        {tabs.map((tab) => {
          const Icon = NAV_ICONS[tab.icon];
          const on = tab.path === activeTab;
          const count = tab.badge ? badges[tab.badge] || 0 : 0;
          const label = t(tab.label);
          return (
            <li key={tab.path} className="flex min-w-0 flex-1">
              <button
                type="button"
                data-tour={`tab-${tab.path}`}
                onClick={() => onSelect(tab.path)}
                aria-current={on ? 'page' : undefined}
                aria-label={count ? `${label}, ${t('common.newCount', { n: count })}` : label}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-caption outline-none',
                  'transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  on ? 'font-semibold text-primary' : 'font-medium text-text-2 hover:text-text',
                )}
              >
                <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-(--dur)', on && 'bg-primary-soft')}>
                  <Icon className="size-6" strokeWidth={on ? 2.25 : 2} aria-hidden="true" />
                  <NavBadge count={count} className="-top-1 right-1" />
                </span>
                <span className="max-w-full truncate px-1">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

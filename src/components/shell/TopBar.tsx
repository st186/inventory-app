// The bar on top of every screen (design review b5): 56 px on phones, 64 px from 1024 px.
//   Home:   logo + "Bunny Momos" + a "Mon 27 Oct · Store" caption
//   Tabs:   the tab's title, with its sub-tabs underneath
//   Pages:  back arrow + the page's title
// Right side: Ask Bunny (owner and managers), the bell with the unread count (opens the Inbox) and
// the avatar (opens the Account sheet; in the sidebar on desktop).
import type { ReactNode } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { PageHeader } from '../ui/page-header';
import { IconButton } from '../ui/icon-button';
import { InitialsAvatar } from '../ui/avatar';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';

export type SubTab = { path: string; label: string };

export function TopBar({
  title,
  caption,
  isHome,
  onBack,
  subTabs,
  activeSub,
  onSubTab,
  chips,
  showAskBunny,
  onAskBunny,
  unread,
  onInbox,
  showBell = true,
  userName,
  onAccount,
  onRefresh,
  refreshing = false,
}: {
  title: ReactNode;
  caption?: ReactNode;
  isHome?: boolean;
  onBack?: () => void;
  subTabs?: SubTab[];
  activeSub?: string;
  onSubTab?: (path: string) => void;
  /** Store chip row (owner, more than one store). */
  chips?: ReactNode;
  showAskBunny: boolean;
  onAskBunny: () => void;
  unread: number;
  onInbox: () => void;
  showBell?: boolean;
  userName: string;
  onAccount: () => void;
  /** Reload everything from the server (logins that load business data). */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useT();
  const actions = (
    <>
      {onRefresh && <IconButton label={t('shell.refresh')} icon={<RefreshCw />} loading={refreshing} onClick={onRefresh} />}
      {showAskBunny && (
        <IconButton
          label={t('nav.askBunny')}
          onClick={onAskBunny}
          icon={<img src="/bunny-logo.png" alt="" className="size-7 object-contain" draggable={false} />}
        />
      )}
      {showBell && <IconButton label={t('nav.inbox')} icon={<Bell />} badge={unread} onClick={onInbox} />}
      <IconButton
        label={t('account.yours')}
        onClick={onAccount}
        className="lg:hidden"
        icon={<InitialsAvatar name={userName} size={32} />}
      />
    </>
  );

  return (
    <PageHeader
      title={isHome ? 'Bunny Momos' : title}
      caption={caption}
      onBack={onBack}
      leading={isHome ? <img src="/bunny-logo.png" alt="" className="size-[30px] object-contain lg:hidden" draggable={false} /> : undefined}
      actions={actions}
      className="z-(--z-sticky)"
    >
      {(chips || (subTabs && subTabs.length > 1)) && (
        <div className="flex flex-col">
          {chips && <div className="flex gap-2 px-4 pb-2.5 lg:hidden">{chips}</div>}
          {subTabs && subTabs.length > 1 && (
            <SubTabBar tabs={subTabs} active={activeSub} onSelect={(path) => onSubTab?.(path)} />
          )}
        </div>
      )}
    </PageHeader>
  );
}

/** One row of tabs under the title (never tabs inside tabs). Scrolls sideways on phones. */
export function SubTabBar({ tabs, active, onSelect }: { tabs: SubTab[]; active?: string; onSelect: (path: string) => void }) {
  return (
    <nav aria-label="Sections" className="no-scrollbar -mb-px flex overflow-x-auto px-2 lg:px-4">
      {tabs.map((tab) => {
        const on = tab.path === active;
        return (
          <button
            key={tab.path}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => !on && onSelect(tab.path)}
            className={cn(
              'relative inline-flex min-h-11 shrink-0 items-center px-3 text-body-sm whitespace-nowrap outline-none',
              'transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              on ? 'font-semibold text-primary' : 'font-medium text-text-2 hover:text-text',
            )}
          >
            {tab.label}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-3 bottom-0 h-0.5 rounded-full', on ? 'bg-primary' : 'bg-transparent')}
            />
          </button>
        );
      })}
    </nav>
  );
}

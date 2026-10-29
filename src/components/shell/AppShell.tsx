// The app shell (design review d1): top bar, bottom nav on phones, rail on tablets, sidebar on
// desktop, the Account sheet, Ask Bunny and the Inbox, around whichever destination the router
// is on. App.tsx keeps the data and sign-in; this decides what is on screen.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import type { InventoryContextType } from '../../App';
import type * as api from '../../utils/api';
import { setScreenPage } from '../../utils/screenContext';
import { useT, type I18nKey } from '../../utils/i18n';
import { StoreSelector } from '../StoreSelector';
import { NotificationsProvider, useNotifications, type NotificationsSource } from '../Notifications';
import type { BadgeKey, Destination, NavModel } from './navConfig';
import { roleLabelKey, tabForPath } from './navConfig';
import type { LegacyTarget, Route } from './router';
import { useShellRouter } from './useShellRouter';
import { ShellProvider, type ShellContextValue, type ShellUser } from './ShellContext';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { NavRail } from './NavRail';
import { Sidebar } from './Sidebar';
import { DestinationView, screenFallback } from './destinations/DestinationView';
import { AppTour, startAppTour } from '../tour/AppTour';

const AccountSheet = lazy(() => import('./AccountSheet').then((m) => ({ default: m.AccountSheet })));
const MorePage = lazy(() => import('./MorePage').then((m) => ({ default: m.MorePage })));
const InboxPage = lazy(() => import('./InboxPage').then((m) => ({ default: m.InboxPage })));
const BunnyChat = lazy(() => import('../BunnyChat').then((m) => ({ default: m.BunnyChat })));

export type AppShellProps = {
  nav: NavModel;
  user: ShellUser;
  context: InventoryContextType;
  stores: api.Store[];
  employees: api.Employee[];
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  refreshStores: () => Promise<void>;
  /** Under the top bar: update available, password expiry, the sync status line. */
  banners?: ReactNode;
  badges: Partial<Record<BadgeKey, number>>;
  notificationsSource: NotificationsSource;
  askBunnyStoreId: string | null;
  passwordDaysLeft: number | null;
  onChangePassword: () => void;
  onLogout: () => void;
  /** The top bar's Refresh (logins that load business data); refreshing spins it. */
  onRefresh?: () => void;
  refreshing?: boolean;
  onEnableNativePush?: () => Promise<boolean>;
  /** App.tsx hands push taps and service-worker messages to the router through this. */
  onRegisterNavigator?: (open: ((target: LegacyTarget) => void) | null) => void;
  renderAudit?: ShellContextValue['renderAudit'];
  /** Role preview (shell-preview.html): no browser history, placeholder screens, fixed answers. */
  preview?: { initialRoute?: Route; accountOpen?: boolean; profileComplete?: boolean; latestVersion?: string | null; history?: boolean };
};

export function AppShell(props: AppShellProps) {
  return (
    <NotificationsProvider source={props.notificationsSource}>
      <ShellFrame {...props} />
    </NotificationsProvider>
  );
}

/** The top bar with the bell's unread count: the only part that re-renders when the inbox polls. */
function TopBarWithInbox(props: Omit<ComponentProps<typeof TopBar>, 'unread'>) {
  const feed = useNotifications();
  return <TopBar {...props} unread={feed.unreadCount} />;
}

function todayCaption(t: (key: I18nKey) => string) {
  const d = new Date();
  return `${t(`date.wd.${d.getDay()}` as I18nKey)} ${d.getDate()} ${t(`date.ms.${d.getMonth()}` as I18nKey)}`;
}

function ShellFrame(props: AppShellProps) {
  const { nav, user, stores, selectedStoreId, preview } = props;
  const { t, lang } = useT();
  const [accountOpen, setAccountOpen] = useState(!!preview?.accountOpen);
  const [accountMounted, setAccountMounted] = useState(!!preview?.accountOpen);
  const [bunnyOpen, setBunnyOpen] = useState(false);
  const [bunnyMounted, setBunnyMounted] = useState(false);

  const openAccount = useCallback(() => {
    setAccountMounted(true);
    setAccountOpen(true);
  }, []);
  const openBunny = useCallback(() => {
    setBunnyMounted(true);
    setBunnyOpen(true);
  }, []);
  const overlayOpen = accountOpen || bunnyOpen;
  const closeOverlay = useCallback(() => {
    if (bunnyOpen) setBunnyOpen(false);
    else setAccountOpen(false);
  }, [bunnyOpen]);

  const router = useShellRouter(nav, { overlayOpen, closeOverlay, syncBrowser: !preview || !!preview.history, initialRoute: preview?.initialRoute });
  const { route } = router;
  const dest: Destination = nav.destinations[route.path] ?? nav.destinations.home;

  // Push taps / service-worker messages land through the router (App.tsx keeps no screen state).
  const { onRegisterNavigator } = props;
  useEffect(() => {
    onRegisterNavigator?.(router.openLegacyTarget);
    return () => onRegisterNavigator?.(null);
  }, [onRegisterNavigator, router.openLegacyTarget]);

  // Bunny explains the open screen; private pages (people, pay, attendance...) keep their old names
  // so they stay out of what is sent (utils/screenContext.ts).
  useEffect(() => {
    setScreenPage(dest.screenPage);
  }, [dest.screenPage]);

  // Each new page starts at the top.
  useEffect(() => {
    if (typeof window !== 'undefined' && !preview) window.scrollTo(0, 0);
  }, [route.path, preview]);

  // The Account sheet's code loads once the first screen is up, so the avatar opens it at once.
  useEffect(() => {
    if (preview) return;
    const timer = setTimeout(() => { import('./AccountSheet').catch(() => undefined); }, 4000);
    return () => clearTimeout(timer);
  }, [preview]);

  const activeTab = tabForPath(nav, route.path);
  const tab = nav.tabs.find((x) => x.path === activeTab);
  const isHome = route.path === 'home';
  const isTabRoot = !!tab && (tab.path === route.path || tab.subs.includes(route.path)) && (tab.subs.length > 0 || tab.path === route.path);
  const isListTab = route.path === 'more' || route.path === 'me';

  const roleLine = useMemo(() => {
    const role = t(roleLabelKey(nav.kind));
    const place = nav.chrome.storeSwitcher
      ? stores.find((s) => s.id === selectedStoreId)?.name || t('shell.allStores')
      : stores.find((s) => s.id === user.storeId)?.name;
    return place ? `${role} · ${place}` : role;
  }, [t, nav, stores, selectedStoreId, user.storeId]);

  const homeCaption = useMemo(() => {
    const place = nav.chrome.storeSwitcher
      ? stores.find((s) => s.id === selectedStoreId)?.name || t('shell.allStores')
      : stores.find((s) => s.id === user.storeId)?.name || (nav.perms.isProductionIncharge || user.designation === 'production_ops' ? t('shell.productionHouse') : user.storeId ? t('shell.store') : '');
    return [todayCaption(t), place].filter(Boolean).join(' · ');
  }, [t, nav, stores, selectedStoreId, user.storeId, user.designation]);

  const usesStore = isHome || ['insights', 'money', 'team', 'stock'].some((p) => route.path === p || route.path.startsWith(`${p}/`)) || route.path === 'reports' || route.path === 'audit-report';
  const showStoreSwitcher = nav.chrome.storeSwitcher && stores.length > 1;
  const storeChip = showStoreSwitcher && usesStore ? (
    <StoreSelector stores={stores} selectedStoreId={selectedStoreId} onStoreChange={props.onStoreChange} variant="chip" />
  ) : undefined;

  // The owner's Home carries the logo and name (wireframe Main); everyone else's says "Today" (StaffHome, CrewHome).
  const brandHome = isHome && nav.kind === 'owner';
  const title = brandHome ? '' : isHome || !(isTabRoot && tab) ? t(dest.label) : t(tab.label);
  const subTabs = isTabRoot && tab && tab.subs.length > 1 ? tab.subs.map((p) => ({ path: p, label: t(nav.destinations[p].label) })) : undefined;
  const showBack = !isHome && !isTabRoot;

  const selectTab = (path: string) => {
    if (path === activeTab && isTabRoot && (tab?.subs.length ?? 0) === 0) return;
    router.go(path);
  };

  // Memoised so the screens re-render when the data or the route changes, not on every App render
  // (the old Analytics landing page relied on React.memo the same way).
  const { context, employees, onStoreChange, refreshStores, renderAudit } = props;
  const isPreview = !!preview;
  const shellValue: ShellContextValue = useMemo(() => ({
    nav,
    router,
    user,
    context,
    stores,
    employees,
    selectedStoreId,
    setSelectedStoreId: onStoreChange,
    refreshStores,
    openAccount,
    openBunny,
    preview: isPreview,
    renderAudit,
  }), [nav, router, user, context, stores, employees, selectedStoreId, onStoreChange, refreshStores, openAccount, openBunny, isPreview, renderAudit]);

  const isMe = route.path === 'me';
  const renderShellPage = useCallback((d: Destination) => (
    <Suspense fallback={screenFallback}>
      {d.spec.screen === 'Inbox' ? (
        <InboxPage onOpenTarget={(target) => router.openLegacyTarget(target)} />
      ) : (
        <MorePage nav={nav} isMe={isMe} name={user.name} roleLine={roleLine} onOpen={(p) => (p === 'tour' ? startAppTour() : router.push(p))} onAccount={openAccount} />
      )}
    </Suspense>
  ), [router, nav, isMe, user.name, roleLine, openAccount]);

  return (
    <ShellProvider value={shellValue}>
      <div className="min-h-dvh bg-bg text-text" lang={lang}>
        <Sidebar
          nav={nav}
          activeTab={activeTab}
          currentPath={route.path}
          badges={props.badges}
          onSelectTab={selectTab}
          onSelectPage={(path, kind) => (kind === 'sub' ? router.replace(path) : router.push(path))}
          storeSwitcher={showStoreSwitcher ? <StoreSelector stores={stores} selectedStoreId={selectedStoreId} onStoreChange={props.onStoreChange} variant="sidebar" /> : undefined}
          userName={user.name}
          roleLine={roleLine}
          onAccount={openAccount}
        />
        <NavRail tabs={nav.tabs} activeTab={activeTab} badges={props.badges} onSelect={selectTab} userName={user.name} onAccount={openAccount} />

        <div className="flex min-h-dvh flex-col md:pl-20 lg:pl-[248px]">
          <TopBarWithInbox
            title={title}
            caption={isHome ? homeCaption : undefined}
            isHome={brandHome}
            onBack={showBack ? () => router.back() : undefined}
            subTabs={subTabs}
            activeSub={route.path}
            onSubTab={(path) => router.replace(path)}
            chips={storeChip}
            showAskBunny={nav.chrome.askBunny}
            onAskBunny={openBunny}
            onInbox={() => router.push('inbox')}
            showBell={route.path !== 'inbox'}
            userName={user.name}
            onAccount={openAccount}
            onRefresh={props.onRefresh}
            refreshing={props.refreshing}
          />
          {props.banners}
          <main
            id="main"
            data-ai-screen
            className={isListTab || route.path === 'inbox' ? 'flex-1 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-6' : 'flex-1 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+8px)] md:pb-6'}
          >
            <DestinationView key={`${route.path}`} dest={dest} params={route.params} renderShellPage={renderShellPage} />
          </main>
        </div>

        <BottomNav tabs={nav.tabs} activeTab={activeTab} badges={props.badges} onSelect={selectTab} />

        {accountMounted && (
          <Suspense fallback={null}>
            <AccountSheet
              open={accountOpen}
              onOpenChange={setAccountOpen}
              name={user.name}
              roleLine={roleLine}
              accessToken={user.accessToken || ''}
              pushUserId={user.employeeId || user.email}
              onEnableNativePush={props.onEnableNativePush}
              showBunnyLanguage={nav.perms.canAskBunny || nav.perms.isAnyIncharge}
              showProfile={!nav.perms.isClusterHead && !nav.perms.isAudit}
              passwordDaysLeft={props.passwordDaysLeft}
              onChangePassword={props.onChangePassword}
              onCompleteProfile={() => router.go('home', { focus: 'profile' })}
              onLogout={props.onLogout}
              preview={preview ? { profileComplete: preview.profileComplete ?? false, latestVersion: preview.latestVersion ?? null } : undefined}
            />
          </Suspense>
        )}
        <AppTour />
        {nav.chrome.askBunny && bunnyMounted && (
          <Suspense fallback={null}>
            <BunnyChat accessToken={user.accessToken || ''} storeId={props.askBunnyStoreId} open={bunnyOpen} onOpenChange={setBunnyOpen} />
          </Suspense>
        )}
      </div>
    </ShellProvider>
  );
}

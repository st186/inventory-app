import * as React from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  ChevronDown,
  Clock,
  Home,
  LayoutGrid,
  Package,
  RefreshCw,
  Sparkles,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { InitialsAvatar } from '../components/ui/avatar';
import { SelectChip } from '../components/ui/chip';
import { Card, CardAction, CardHeader, CardTitle } from '../components/ui/card';
import { ListGroup, ListRow } from '../components/ui/list-row';
import { StatGrid, StatSplit, StatTile } from '../components/ui/stat-tile';
import { StatusChip } from '../components/ui/status-chip';
import { Money, MoneyInput, formatINR } from '../components/ui/money';
import { Field } from '../components/ui/field';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { DateStrip } from '../components/ui/date-strip';
import { todayIST } from '../components/ui/date-utils';
import { ResponsiveModal } from '../components/ui/responsive-modal';
import { toast } from '../components/ui/sonner';
import { VoiceButton } from '../components/VoiceButton';
import { useLang, useT, type I18nKey } from '../utils/i18n';

function useL() {
  const lang = useLang();
  return (en: string, bn: string) => (lang === 'bn' ? bn : en);
}

// Gallery stand-in for the WP0b bottom nav (the real one lives in src/components/shell/).
function SampleBottomNav({ items, active }: { items: { key: I18nKey; icon: LucideIcon; badge?: number }[]; active: I18nKey }) {
  const { t } = useT();
  return (
    <nav aria-label={t('nav.main')} className="flex h-16 border-t border-border bg-surface">
      {items.map(({ key, icon: Icon, badge }) => {
        const on = key === active;
        return (
          <a
            key={key}
            href="#samples"
            aria-current={on ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-caption font-medium no-underline ${on ? 'font-semibold text-primary' : 'text-text-2 hover:text-text'}`}
          >
            <span className={`flex h-[30px] w-14 items-center justify-center rounded-full ${on ? 'bg-primary-soft' : ''}`}>
              <Icon className="size-[22px]" aria-hidden="true" />
            </span>
            {t(key)}
            {badge ? (
              <span className="num absolute top-1 right-[18%] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-caption font-semibold text-on-danger">
                {badge}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

function TopBar({ children }: { children: React.ReactNode }) {
  return <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface pr-2 pl-4">{children}</header>;
}

export function OwnerHomeSample() {
  const { t, lang } = useT();
  const L = useL();
  return (
    <div className="flex flex-col bg-bg text-text" lang={lang}>
      <TopBar>
        <img src="/bunny-logo.png" alt="" className="size-[30px] object-contain" />
        <div className="ml-1.5 flex min-w-0 flex-1 flex-col">
          <span className="text-subtitle leading-5 font-semibold">Bunny Momos</span>
          <span className="text-caption text-text-3">{L('Fri 27 Oct · All stores', 'শুক্র ২৭ অক্টো · সব স্টোর')}</span>
        </div>
        <IconButton label={t('nav.askBunny')} icon={<img src="/bunny-logo.png" alt="" className="size-[26px] object-contain" />} />
        <IconButton label={t('nav.inbox')} icon={<Bell />} badge={7} />
        <IconButton label={t('account.yours')} icon={<InitialsAvatar name="Subham Tewari" size={32} />} />
      </TopBar>

      <main className="flex flex-col gap-5 p-4">
        <div className="flex gap-2">
          <SelectChip leadingIcon={<CalendarDays />} trailingIcon={<ChevronDown />}>{t('date.today')}</SelectChip>
          <SelectChip trailingIcon={<ChevronDown />}>{L('All stores', 'সব স্টোর')}</SelectChip>
        </div>

        <StatTile
          hero
          href="#samples"
          label={t('home.salesToday')}
          value={<Money value={10754} />}
          headerChip={<StatusChip tone="success" icon={BarChart3}>{t('status.onTrack')}</StatusChip>}
          caption={L('Usual for a Friday: ₹9,700–11,800', 'শুক্রবারে সাধারণত: ₹৯,৭০০–১১,৮০০')}
        >
          <StatSplit items={[
            { label: L('Counter', 'কাউন্টার'), value: <Money value={6120} /> },
            { label: 'Zomato', value: <Money value={2890} /> },
            { label: 'Swiggy', value: <Money value={1744} /> },
          ]} />
        </StatTile>

        <StatGrid>
          <StatTile label={L('Net profit · Oct', 'নিট লাভ · অক্টো')} value={<Money value={48200} />} delta={{ value: 6, label: L('vs Sep', 'সেপ্টে-র তুলনায়') }} />
          <StatTile label={t('home.spentToday')} value={<Money value={3460} />} caption={L('12 entries', '১২টি খরচ')} />
          <StatTile label={L('Cash in hand', 'হাতে ক্যাশ')} value={<Money value={3000} />} chip={<StatusChip tone="warning">{L('Not counted', 'গোনা হয়নি')}</StatusChip>} />
          <StatTile label={L('Paytm balance', 'পেটিএম ব্যালান্স')} value={<Money value={12450} />} caption={L('After payouts', 'পেমেন্টের পরে')} />
        </StatGrid>

        <ListGroup title={t('home.needsAttention')} action={<Button variant="link" size="sm">{t('common.seeAll', { n: 7 })}</Button>}>
          <ListRow href="#samples" icon={Wallet} title={L('Cash short by ₹240', '₹২৪০ ক্যাশ কম')} subtitle={L("Yesterday's day close · approve", 'গতকালের হিসাব · অনুমোদন করুন')} trailing={<StatusChip tone="danger">1</StatusChip>} />
          <ListRow href="#samples" icon={CalendarDays} title={L('Leave requests', 'ছুটির আবেদন')} subtitle={L('Next week · store and production', 'পরের সপ্তাহ · স্টোর ও প্রোডাকশন')} trailing={<StatusChip>2</StatusChip>} />
          <ListRow href="#samples" icon={Clock} title={L('Timesheets to approve', 'টাইমশিট অনুমোদন')} subtitle={L('This week', 'এই সপ্তাহ')} trailing={<StatusChip>4</StatusChip>} />
          <ListRow href="#samples" icon={AlertTriangle} iconTone="danger" title={L('Out of stock now', 'এখন স্টক নেই')} subtitle={L('Chicken cheese momo · since 6:40 pm', 'চিকেন চিজ মোমো · ৬:৪০ থেকে')} />
          <ListRow href="#samples" icon={Camera} title={L('Workplace photos to review', 'কাজের জায়গার ছবি দেখুন')} subtitle={L('Store · 3 pm check', 'স্টোর · ৩টের চেক')} trailing={<StatusChip>3</StatusChip>} />
        </ListGroup>

        <Card>
          <CardHeader>
            <Sparkles className="size-5 text-text-2" aria-hidden="true" />
            <CardTitle>{L("Today's brief", 'আজকের সারাংশ')}</CardTitle>
            <CardAction>
              <span className="text-caption text-text-3">{L('by Bunny · 1:48 am', 'বানি · রাত ১:৪৮')}</span>
            </CardAction>
          </CardHeader>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body-md">
            <li>{L('Prep about 640 chicken momos: Fridays run busy.', 'প্রায় ৬৪০টি চিকেন মোমো তৈরি রাখুন: শুক্রবার ভিড় থাকে।')}</li>
            <li>{L("Yesterday's cash count is still open.", 'গতকালের ক্যাশ গোনা এখনও বাকি।')}</li>
            <li>{L('Two leave requests need an answer before Monday.', 'সোমবারের আগে দুটি ছুটির আবেদনের উত্তর দিন।')}</li>
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">{L('Read full brief', 'পুরো সারাংশ')}</Button>
            <Button variant="ghost" size="sm">{t('nav.askBunny')}</Button>
          </div>
        </Card>

        <ListGroup title={L('Next 7 days', 'পরের ৭ দিন')} action={<Button variant="link" size="sm">{L('See forecast', 'পূর্বাভাস')}</Button>}>
          <ListRow title={L('Today · Fri', 'আজ · শুক্র')} subtitle={L('Non-veg 486 · Veg 143 pieces', 'নন-ভেজ ৪৮৬ · ভেজ ১৪৩ পিস')} trailing={<span className="num text-body-sm font-semibold">₹9.7k–11.8k</span>} />
          <ListRow title={L('Sat', 'শনি')} subtitle={L('Non-veg 552 · Veg 160 pieces', 'নন-ভেজ ৫৫২ · ভেজ ১৬০ পিস')} trailing={<span className="num text-body-sm font-semibold">₹11.2k–13.5k</span>} />
          <ListRow title={L('Sun', 'রবি')} subtitle={L('Non-veg 590 · Veg 171 pieces', 'নন-ভেজ ৫৯০ · ভেজ ১৭১ পিস')} trailing={<span className="num text-body-sm font-semibold">₹12.0k–14.4k</span>} />
        </ListGroup>

        <ListGroup>
          <ListRow href="#samples" icon={Users} title={L('5 on shift now', 'এখন ৫ জন শিফটে')} subtitle={L('2 on leave this month', 'এই মাসে ২ জন ছুটিতে')} />
        </ListGroup>
      </main>

      <SampleBottomNav
        active="nav.home"
        items={[
          { key: 'nav.home', icon: Home },
          { key: 'nav.insights', icon: BarChart3 },
          { key: 'nav.money', icon: Wallet },
          { key: 'nav.team', icon: Users, badge: 3 },
          { key: 'nav.more', icon: LayoutGrid },
        ]}
      />
    </div>
  );
}

export function DayCloseSample() {
  const { t, lang } = useT();
  const L = useL();
  const [tab, setTab] = React.useState('close');
  const [date, setDate] = React.useState(todayIST());
  const [paytm, setPaytm] = React.useState<number | null>(3500);
  const [cash, setCash] = React.useState<number | null>(2380);
  const [drawer, setDrawer] = React.useState<number | null>(3000);
  const [how, setHow] = React.useState(false);
  const counted = (paytm ?? 0) + (cash ?? 0);
  const diff = counted - 6120;

  return (
    <div className="flex flex-col bg-bg text-text" lang={lang}>
      <TopBar>
        <span className="flex-1 text-title font-semibold">{t('nav.money')}</span>
        <IconButton label={t('account.yours')} icon={<InitialsAvatar name="Nabendu Bera" size={32} />} />
      </TopBar>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={L('Money sections', 'টাকার বিভাগ')}>
          <TabsTrigger value="close">{L('Day close', 'দিনের হিসাব')}</TabsTrigger>
          <TabsTrigger value="expenses">{L('Expenses', 'খরচ')}</TabsTrigger>
          <TabsTrigger value="paytm">Paytm</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="border-b border-border bg-surface px-2 py-2">
        <DateStrip value={date} onChange={setDate} max={todayIST()} />
      </div>

      <main className="flex flex-col gap-[18px] p-4">
        <div className="flex items-center gap-2.5">
          <StatusChip status="dayClose.draft" />
          <span className="text-label text-text-3">{L('Not sent yet · send after closing at 10:30 pm', 'এখনও পাঠানো হয়নি · রাত ১০:৩০-এ বন্ধের পরে পাঠান')}</span>
        </div>

        <ListGroup
          title={L('Sales from the POS', 'POS থেকে বিক্রি')}
          action={<Button variant="secondary" size="sm" leadingIcon={<RefreshCw />} onClick={() => toast.success(L('POS synced', 'POS সিঙ্ক হয়েছে'))}>{L('Sync now', 'সিঙ্ক করুন')}</Button>}
        >
          <ListRow density="compact" title={L('POS total', 'POS মোট')} subtitle={L('Synced 10:34 pm', 'সিঙ্ক রাত ১০:৩৪')} trailing={<Money value={10754} className="text-title font-semibold" />} />
          <ListRow density="compact" title={L('Counter', 'কাউন্টার')} subtitle={L('Cash and Paytm', 'ক্যাশ ও পেটিএম')} amount={6120} />
          <ListRow density="compact" title="Zomato" amount={2890} />
          <ListRow density="compact" title="Swiggy" amount={1744} />
        </ListGroup>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-subtitle font-semibold">{L('Count your money', 'টাকা গুনুন')}</h2>
            <VoiceButton label={t('voice.speak')} onText={(text) => { toast.info(text); }} />
          </div>
          <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-4">
            <Field label={L('Paytm received', 'পেটিএম পেয়েছেন')} hint={lang === 'bn' ? undefined : <span lang="bn">পেটিএম</span>}>
              <MoneyInput value={paytm} onValueChange={(n) => setPaytm(n)} />
            </Field>
            <Field label={L('Cash collected', 'ক্যাশ পেয়েছেন')} hint={lang === 'bn' ? undefined : <span lang="bn">ক্যাশ</span>}>
              <MoneyInput value={cash} onValueChange={(n) => setCash(n)} />
            </Field>
            <Field label={L('Cash left in the drawer', 'ড্রয়ারে রাখা ক্যাশ')} hint={lang === 'bn' ? undefined : <span lang="bn">হাতে ক্যাশ</span>}>
              <MoneyInput value={drawer} onValueChange={(n) => setDrawer(n)} />
            </Field>
          </div>
        </section>

        <ListGroup title={L('Does it match?', 'মিলছে কি?')}>
          <ListRow density="compact" title={L('Counter sales', 'কাউন্টার বিক্রি')} subtitle={L('From the POS', 'POS থেকে')} amount={6120} />
          <ListRow density="compact" title={L('You counted', 'আপনি গুনেছেন')} subtitle={L('Paytm + cash', 'পেটিএম + ক্যাশ')} amount={counted} />
          <ListRow
            density="compact"
            title={L('Difference', 'পার্থক্য')}
            subtitle={
              <Button variant="link" size="sm" className="text-label font-medium" onClick={() => setHow(true)}>
                {L('How is this worked out?', 'কীভাবে হিসাব হয়?')}
              </Button>
            }
            trailing={
              diff === 0 ? (
                <StatusChip status="dayClose.matched" />
              ) : diff < 0 ? (
                <StatusChip tone="danger" icon={AlertTriangle}>{t('status.short', { amount: formatINR(Math.abs(diff)) })}</StatusChip>
              ) : (
                <StatusChip tone="warning">{t('status.excess', { amount: formatINR(diff) })}</StatusChip>
              )
            }
          />
        </ListGroup>
      </main>

      <div className="sticky bottom-0 flex gap-2.5 border-t border-border bg-surface px-4 py-3">
        <Button variant="secondary" size="lg">{t('dayClose.saveDraft')}</Button>
        <Button size="lg" className="flex-1" onClick={() => toast.success(L('Day close sent', 'দিনের হিসাব পাঠানো হয়েছে'))}>{t('dayClose.send')}</Button>
      </div>
      <SampleBottomNav
        active="nav.money"
        items={[
          { key: 'nav.home', icon: Home },
          { key: 'nav.stock', icon: Package },
          { key: 'nav.money', icon: Wallet },
          { key: 'nav.team', icon: Users },
          { key: 'nav.me', icon: User },
        ]}
      />

      <ResponsiveModal open={how} onOpenChange={setHow} title={L('How the difference is worked out', 'পার্থক্য কীভাবে হিসাব হয়')}>
        <p className="text-body text-text-2">
          {L(
            'Counter sales from the POS, minus the Paytm and cash you counted. Short means less money than the POS says; excess means more.',
            'POS-এর কাউন্টার বিক্রি থেকে আপনার গোনা পেটিএম আর ক্যাশ বাদ দিলে পার্থক্য পাওয়া যায়।',
          )}
        </p>
      </ResponsiveModal>
    </div>
  );
}

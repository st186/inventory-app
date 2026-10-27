import * as React from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Camera,
  ChevronDown,
  Check,
  Clock,
  MoreHorizontal,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';

import { Button } from '../components/ui/button';
import { IconButton } from '../components/ui/icon-button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { NativeSelect, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Money, MoneyInput, formatCompactINR, formatINR } from '../components/ui/money';
import { Checkbox } from '../components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Switch } from '../components/ui/switch';
import { SegmentedControl } from '../components/ui/segmented-control';
import { ChoiceChips, FilterChips, SelectChip } from '../components/ui/chip';
import { NumberStepper } from '../components/ui/number-stepper';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { IconWell, ListGroup, ListRow } from '../components/ui/list-row';
import { StatGrid, StatSplit, StatTile } from '../components/ui/stat-tile';
import { STATUS, StatusChip, type StatusKey } from '../components/ui/status-chip';
import { Badge } from '../components/ui/badge';
import { Callout } from '../components/ui/callout';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import { Delayed, Skeleton, SkeletonChart, SkeletonListRows, SkeletonStatTiles, SkeletonText } from '../components/ui/skeleton';
import { toast } from '../components/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { PageHeader } from '../components/ui/page-header';
import { DateStrip } from '../components/ui/date-strip';
import { DateRangeChip } from '../components/ui/date-range-chip';
import { rangeForPreset, todayIST, addDaysISO, type DateRange } from '../components/ui/date-utils';
import { ResponsiveModal } from '../components/ui/responsive-modal';
import { confirm, promptText } from '../components/ui/confirm';
import { PickerField, PickerSheet, type PickerItem } from '../components/ui/picker-sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type SortDirection } from '../components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart';
import { CHANNEL_COLORS, CHART_COLORS, ChartLegendChips, ShareBars, chartAxisProps, chartGridProps } from '../components/ui/chart-theme';
import { Progress } from '../components/ui/progress';
import { InitialsAvatar } from '../components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { DateSelector } from '../components/DateSelector';
import { DatePicker } from '../components/DatePicker';
import { VoiceButton } from '../components/VoiceButton';
import { CompactLoadingSkeleton, LoadingBar, SectionSkeleton } from '../components/LoadingSkeleton';
import { AutocompleteInput } from '../components/AutocompleteInput';
import { EmployeeMultiSelect } from '../components/EmployeeMultiSelect';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { UpdateBanner } from '../components/UpdateAvailableBanner';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useT, useLang } from '../utils/i18n';

/** Sample text in English or Bengali (Hindi falls back to English here). */
function useL() {
  const lang = useLang();
  return (en: string, bn: string) => (lang === 'bn' ? bn : en);
}

function Demo({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <h3 className="overline-label">{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

// ---------------------------------------------------------------- Tokens

const SWATCHES: [string, string][] = [
  ['primary', 'Action'],
  ['primary-soft', 'Action soft'],
  ['brand-saffron', 'Saffron'],
  ['brand-ink', 'Ink'],
  ['bg', 'Paper'],
  ['surface', 'Card'],
  ['surface-2', 'Surface 2'],
  ['surface-3', 'Surface 3'],
  ['border', 'Border'],
  ['border-strong', 'Border strong'],
  ['text-2', 'Text 2'],
  ['text-3', 'Text 3'],
  ['success', 'Success'],
  ['warning', 'Warning'],
  ['danger', 'Danger'],
  ['info', 'Info'],
  ['chart-1', 'Chart 1'],
  ['chart-2', 'Chart 2'],
  ['chart-3', 'Chart 3'],
  ['chart-4', 'Chart 4'],
  ['chart-5', 'Chart 5'],
  ['channel-counter', 'Counter'],
  ['channel-zomato', 'Zomato'],
  ['channel-swiggy', 'Swiggy'],
];

function Swatch({ token, name }: { token: string; name: string }) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim());
  }, [token]);
  return (
    <div className="flex flex-col gap-1">
      <div className="h-12 rounded-md border border-border" style={{ background: `var(--${token})` }} />
      <span className="text-label font-semibold">{name}</span>
      <span className="num text-caption text-text-3">--{token} {value}</span>
    </div>
  );
}

const RADIUS_CLASS = { xs: 'rounded-xs', sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' } as const;

function TokensSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {SWATCHES.map(([t, n]) => (
          <Swatch key={t} token={t} name={n} />
        ))}
      </div>
      <Grid>
        <Demo title="Radius">
          <div className="flex flex-wrap gap-3">
            {(['xs', 'sm', 'md', 'lg', 'xl', 'full'] as const).map((r) => (
              <div key={r} className={`flex size-16 items-end justify-center border border-border-strong bg-surface-2 pb-1 text-caption text-text-2 ${RADIUS_CLASS[r]}`}>
                {r}
              </div>
            ))}
          </div>
        </Demo>
        <Demo title="Elevation">
          <div className="flex flex-wrap gap-4">
            <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-border bg-surface text-caption">0 flat</div>
            <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-surface text-caption shadow-e1">e1</div>
            <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-surface text-caption shadow-e2">e2</div>
            <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-surface text-caption shadow-e3">e3</div>
          </div>
        </Demo>
      </Grid>
    </div>
  );
}

function TypeSection() {
  const L = useL();
  return (
    <Grid>
      <Demo title="Scale (Inter)">
        <span className="num text-display">₹10,754</span>
        <span className="text-title-lg font-semibold">Page title 22</span>
        <span className="text-title font-semibold">Top bar title 18</span>
        <span className="text-subtitle font-semibold">Card title 16</span>
        <span className="text-body">Body 16: inputs never smaller, so phones don&apos;t zoom</span>
        <span className="text-body-md font-medium">Row title 15</span>
        <span className="text-body-sm text-text-2">Secondary 14: row subtitles and table cells</span>
        <span className="text-label font-medium">Label 13: chips, tabs, field labels</span>
        <span className="text-caption text-text-3">Caption 12: the smallest size allowed</span>
        <span className="overline-label">Overline 12</span>
      </Demo>
      <Demo title="Bengali and Hindi (Noto, bundled)">
        <p lang="bn" className="text-title font-semibold">আজকের বিক্রি</p>
        <p lang="bn" className="text-body">ক্যাশ ৩৪০০ · পেটিএম ৩৫০০ · দিনের হিসাব পাঠান</p>
        <p lang="bn" className="text-body-sm text-text-2">যুক্তাক্ষর: ক্ষ ত্র জ্ঞ স্ত্র ন্ত্র ষ্ণ</p>
        <p lang="hi" className="text-body">आज की बिक्री · दिन का हिसाब भेजें</p>
        <p className="num text-body">
          {L('Tabular figures', 'সংখ্যা')}: {formatINR(312400)} · {formatINR(1234.5)} · {formatINR(-240, { sign: true })} · {formatCompactINR(1180000)}
        </p>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Buttons

function ButtonsSection() {
  const { t } = useT();
  const [loading, setLoading] = React.useState(false);
  return (
    <Grid>
      <Demo title="Variants (md 44 px)">
        <div className="flex flex-wrap gap-2.5">
          <Button>{t('dayClose.send')}</Button>
          <Button variant="secondary">{t('dayClose.saveDraft')}</Button>
          <Button variant="ghost">{t('common.cancel')}</Button>
          <Button variant="danger" leadingIcon={<Trash2 />}>{t('common.delete')}</Button>
          <Button variant="danger-ghost">Delete expense</Button>
          <Button variant="link">See all (7)</Button>
        </div>
      </Demo>
      <Demo title="Sizes and states">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />}>Sync now</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large 52</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button loading={loading} onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 1500); }}>
            {t('common.save')}
          </Button>
          <Button disabled>{t('common.send')}</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </div>
        <Button size="lg" fullWidth leadingIcon={<Clock />}>{t('shift.start')}</Button>
      </Demo>
      <Demo title="Icon buttons">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label={t('nav.inbox')} icon={<Bell />} badge={7} />
          <IconButton label={t('common.search')} icon={<Search />} />
          <IconButton label={t('common.moreActions')} icon={<MoreHorizontal />} variant="secondary" />
          <IconButton label="Add" icon={<Plus />} variant="primary" />
          <IconButton label="Delete" icon={<Trash2 />} variant="danger-ghost" />
          <IconButton label="Small" icon={<Check />} size="sm" />
          <IconButton label="Loading" icon={<Check />} loading />
          <IconButton label="Many" icon={<Bell />} badge={140} />
        </div>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Inputs

const ITEMS: PickerItem[] = [
  { value: 'chicken', label: 'Chicken', description: 'Ingredient · last bought ₹195 a kg', keywords: 'murgi মুরগি', group: 'Ingredients' },
  { value: 'cabbage', label: 'Cabbage', description: 'Ingredient · ₹40 a bundle', keywords: 'bandhakopi বাঁধাকপি', group: 'Ingredients' },
  { value: 'flour', label: 'Flour (maida)', description: 'Ingredient · 25 kg bag', keywords: 'ময়দা', group: 'Ingredients' },
  { value: 'cheese', label: 'Cheese slices', description: 'Ingredient · pack of 20', group: 'Ingredients' },
  { value: 'boxes', label: 'Packaging boxes', description: 'Running cost · 200 pieces', group: 'Running costs' },
  { value: 'fuel', label: 'Rider fuel', description: 'Running cost', group: 'Running costs' },
  { value: 'phenyl', label: 'Cleaning supplies', description: 'Running cost', group: 'Running costs' },
  ...Array.from({ length: 30 }, (_, i) => ({ value: `item-${i}`, label: `Kitchen item ${i + 1}`, group: 'Kitchen utilities' })),
];

function InputsSection() {
  const { t } = useT();
  const L = useL();
  const [amount, setAmount] = React.useState<number | null>(600);
  const [qty, setQty] = React.useState('3');
  const [item, setItem] = React.useState<string | null>('chicken');
  const [desc, setDesc] = React.useState('');
  const [radix, setRadix] = React.useState('cash');
  return (
    <Grid>
      <Demo title="Text fields">
        <Field label={L('Item name', 'জিনিসের নাম')} helper={L('Label above, help below, never a placeholder-only field', 'উপরে নাম, নিচে সাহায্য')}>
          <Input placeholder="e.g. Chicken" defaultValue="Chicken" />
        </Field>
        <Field label={L('Search', 'খুঁজুন')} hideLabel>
          <Input type="search" placeholder={L('Search by name or ID', 'নাম বা আইডি দিয়ে খুঁজুন')} leading={<Search />} />
        </Field>
        <Field label={L('Quantity', 'পরিমাণ')} error={L('Enter how many kg', 'কত কেজি লিখুন')} required>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} trailing={<span className="text-body-sm text-text-3">kg</span>} />
        </Field>
        <Field label={L('Disabled', 'বন্ধ')} disabled>
          <Input defaultValue="Can't change this" />
        </Field>
        <Field label={L('Notes', 'নোট')} optional>
          <Textarea placeholder={L('Anything the production house should know', 'প্রোডাকশনকে কিছু জানানোর থাকলে')} />
        </Field>
      </Demo>
      <Demo title="Money, pickers, selects">
        <Field label={t('money.amount')} helper={amount ? `${formatINR(amount / 3)} a kg · usual price` : undefined}>
          <MoneyInput value={amount} onValueChange={(n) => setAmount(n)} />
        </Field>
        <Field label={L('Cash collected', 'ক্যাশ')} hint={L('ক্যাশ', 'Cash')} error={L('Count the cash first', 'আগে ক্যাশ গুনুন')}>
          <MoneyInput value={null} onValueChange={() => {}} />
        </Field>
        <Field label={L('What was it for?', 'কীসের জন্য?')}>
          <PickerField
            title={L('Choose an item', 'জিনিস বেছে নিন')}
            items={ITEMS}
            value={item}
            onValueChange={setItem}
            leadingIcon={<Search />}
            onCreate={(q) => toast.success(`Added "${q}"`)}
          />
        </Field>
        <Field label={L('Description (autocomplete)', 'বিবরণ')}>
          <AutocompleteInput value={desc} onChange={setDesc} suggestions={['Gas refill', 'Rider fuel', 'Cleaning supplies']} placeholder="Type to see suggestions" />
        </Field>
        <Field label={L('Paid from (Radix select)', 'কোথা থেকে দিলেন')}>
          <Select value={radix} onValueChange={setRadix}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">{t('money.cash')}</SelectItem>
              <SelectItem value="paytm">{t('money.paytm')}</SelectItem>
              <SelectItem value="split">{t('money.split')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={L('Unit (native select)', 'একক')}>
          <NativeSelect defaultValue="kg">
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="piece">piece</option>
          </NativeSelect>
        </Field>
        <DatePicker label={L('Start date (DatePicker)', 'শুরুর তারিখ')} value={todayIST()} onChange={() => {}} className="w-full" />
        <DatePicker label="Date:" value={todayIST()} onChange={() => {}} />
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Choices

function ChoicesSection() {
  const { t, lang } = useT();
  const L = useL();
  const [seg, setSeg] = React.useState<'cash' | 'paytm' | 'split'>('cash');
  const [where, setWhere] = React.useState<'store' | 'production'>('store');
  const [filter, setFilter] = React.useState('all');
  const [unit, setUnit] = React.useState('kg');
  const [qty, setQty] = React.useState(300);
  const [on, setOn] = React.useState(true);
  const [checked, setChecked] = React.useState<boolean | 'indeterminate'>(true);
  const [radio, setRadio] = React.useState('thisMonth');
  const [langPick, setLangPick] = React.useState(lang);
  return (
    <Grid>
      <Demo title="Segmented control">
        <SegmentedControl aria-label={t('money.paidFrom')} value={seg} onValueChange={setSeg} options={[
          { value: 'cash', label: t('money.cash') },
          { value: 'paytm', label: t('money.paytm') },
          { value: 'split', label: t('money.split') },
        ]} />
        <SegmentedControl aria-label="Business" size="sm" value={where} onValueChange={setWhere} options={[
          { value: 'store', label: L('Store', 'স্টোর') },
          { value: 'production', label: L('Production', 'প্রোডাকশন') },
        ]} />
        <SegmentedControl aria-label={t('account.language')} selectedTone="primary" value={langPick} onValueChange={setLangPick} options={[
          { value: 'bn', label: 'বাংলা', lang: 'bn' },
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिन्दी', lang: 'hi' },
        ]} />
        <SegmentedControl aria-label="Disabled" disabled value="a" onValueChange={() => {}} options={[{ value: 'a', label: 'Today' }, { value: 'b', label: 'Week' }]} />
      </Demo>
      <Demo title="Chips">
        <FilterChips aria-label="Filter people" value={filter} onValueChange={setFilter} options={[
          { value: 'all', label: L('All', 'সব') },
          { value: 'store', label: L('Store', 'স্টোর') },
          { value: 'production', label: L('Production', 'প্রোডাকশন') },
          { value: 'contract', label: L('Contract', 'চুক্তি') },
          { value: 'inactive', label: L('Inactive', 'নিষ্ক্রিয়') },
        ]} />
        <FilterChips aria-label="Queue" value="pack" onValueChange={() => {}} options={[
          { value: 'pack', label: L('To pack', 'প্যাক বাকি'), count: 1 },
          { value: 'packed', label: L('Packed', 'প্যাক হয়েছে'), count: 0 },
          { value: 'sent', label: L('Sent', 'পাঠানো'), count: 2 },
        ]} />
        <ChoiceChips aria-label="Unit" value={unit} onValueChange={setUnit} options={['kg', 'g', 'piece', 'pack', 'bundle'].map((u) => ({ value: u, label: u }))} />
        <div className="flex flex-wrap gap-2">
          <SelectChip leadingIcon={<CalendarDays />} trailingIcon={<ChevronDown />}>{t('date.today')}</SelectChip>
          <SelectChip>{L('All stores', 'সব স্টোর')}</SelectChip>
        </div>
      </Demo>
      <Demo title="Number stepper">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-body-md font-medium">{L('Chicken', 'চিকেন')}</span>
            <span className="text-label text-text-3">{L('Left now: 40', 'এখন আছে: ৪০')}</span>
          </div>
          <NumberStepper label={L('chicken', 'চিকেন')} value={qty} onChange={setQty} step={10} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body-md font-medium">Read-only value</span>
          <NumberStepper label="veg" value={0} onChange={() => {}} editable={false} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-body-md text-text-3">Disabled</span>
          <NumberStepper label="paneer" value={60} onChange={() => {}} disabled />
        </div>
      </Demo>
      <Demo title="Switch, checkbox, radio">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-body-md">{L('Spread fixed costs over the month', 'মাসজুড়ে খরচ ভাগ করুন')}</span>
          <Switch checked={on} onCheckedChange={setOn} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3 text-text-3">
          <span className="text-body-md">Disabled switch</span>
          <Switch disabled />
        </label>
        <label className="flex min-h-11 items-center gap-3 px-3">
          <Checkbox checked={checked} onCheckedChange={setChecked} />
          <span className="text-body-md">{L('Include production house', 'প্রোডাকশন হাউস ধরুন')}</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 px-3">
          <Checkbox checked="indeterminate" />
          <span className="text-body-md">Some selected</span>
        </label>
        <RadioGroup value={radio} onValueChange={setRadio} aria-label="Range" className="gap-0 px-3">
          {['thisMonth', 'lastMonth', 'custom'].map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem value={r} />
              <span className="text-body-md">{t(r === 'custom' ? 'date.custom' : (`date.${r}` as never))}</span>
            </label>
          ))}
        </RadioGroup>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Lists and cards

function ListsSection() {
  const { t } = useT();
  const L = useL();
  const [state, setState] = React.useState<'data' | 'loading' | 'empty' | 'error'>('data');
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl aria-label="List state" size="sm" className="max-w-md" value={state} onValueChange={setState} options={[
        { value: 'data', label: 'Data' },
        { value: 'loading', label: 'Loading' },
        { value: 'empty', label: 'Empty' },
        { value: 'error', label: 'Error' },
      ]} />
      <Grid>
        <div className="flex flex-col gap-4">
          {state === 'loading' && <SkeletonListRows count={4} />}
          {state === 'error' && <ErrorState onRetry={() => setState('loading')} />}
          {state === 'empty' && (
            <ListGroup title={t('home.needsAttention')} empty={<EmptyState compact icon={Check} title={t('empty.allCaughtUp')} body={L('Nothing needs you right now.', 'এখন আপনার কিছু করার নেই।')} />} />
          )}
          {state === 'data' && (
            <ListGroup title={t('home.needsAttention')} action={<Button variant="link" size="sm">{t('common.seeAll', { n: 7 })}</Button>}>
              <ListRow icon={Wallet} title={L('Cash short by ₹240', '₹২৪০ ক্যাশ কম')} subtitle={L("Yesterday's day close · approve", 'গতকালের হিসাব · অনুমোদন')} trailing={<StatusChip tone="danger">1</StatusChip>} href="#lists" />
              <ListRow icon={CalendarDays} title={L('Leave requests', 'ছুটির আবেদন')} subtitle={L('Next week · store and production', 'পরের সপ্তাহ')} trailing={<StatusChip>2</StatusChip>} onClick={() => toast.info('Open leave requests')} />
              <ListRow icon={AlertTriangle} iconTone="danger" title={L('Out of stock now', 'এখন স্টক নেই')} subtitle={L('Chicken cheese momo · since 6:40 pm', 'চিকেন চিজ মোমো · ৬:৪০ থেকে')} href="#lists" />
              <ListRow icon={Camera} title={L('Workplace photos to review', 'কাজের জায়গার ছবি দেখুন')} subtitle="Store · 3 pm check" trailing={<StatusChip>3</StatusChip>} href="#lists" />
            </ListGroup>
          )}
          <ListGroup overline={L('Ingredients', 'উপকরণ')}>
            <ListRow title="Chicken" subtitle="3 kg · ₹200 a kg" chip={<Badge>{t('money.cash')}</Badge>} amount={600} onClick={() => {}} chevron={false} />
            <ListRow title="Flour (maida)" subtitle="25 kg bag" chip={<Badge>{t('money.paytm')}</Badge>} amount={1150} onClick={() => {}} chevron={false} />
            <ListRow title="Cheese slices" subtitle="5 packs × 20" chip={<Badge>{t('money.split')}</Badge>} amount={480} onClick={() => {}} chevron={false} />
          </ListGroup>
        </div>
        <div className="flex flex-col gap-4">
          <ListGroup overline={L('Team', 'টিম')}>
            <ListRow leading={<InitialsAvatar name="Nabendu Bera" status="success" statusLabel="On shift" />} title="Nabendu" subtitle={L('Store incharge · on shift', 'স্টোর ইনচার্জ · শিফটে')} chip={<StatusChip tone="brand">Incharge</StatusChip>} href="#lists" />
            <ListRow leading={<InitialsAvatar name="Aniket Paul" status="neutral" />} title="Aniket" subtitle="Operations manager · off today" chip={<StatusChip>Permanent</StatusChip>} href="#lists" />
            <ListRow density="compact" title="POS total" subtitle="Synced 10:34 pm" trailing={<Money value={10754} className="text-title font-semibold" />} />
            <ListRow muted icon={Check} iconTone="success" title={t('home.doneToday', { n: 2 })} subtitle="Stock request · Profile" chevron="down" onClick={() => {}} aria-expanded={false} />
            <ListRow title="Disabled row" subtitle="Can't open yet" onClick={() => {}} disabled />
          </ListGroup>
          <Card>
            <CardHeader>
              <CardTitle>{L("Today's brief", 'আজকের সারাংশ')}</CardTitle>
              <CardAction>
                <span className="text-caption text-text-3">by Bunny · 1:48 am</span>
              </CardAction>
            </CardHeader>
            <CardDescription>{L('Prep about 640 chicken momos: Fridays run busy.', 'প্রায় ৬৪০টি চিকেন মোমো তৈরি রাখুন।')}</CardDescription>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">Read full brief</Button>
              <Button variant="ghost" size="sm">{t('nav.askBunny')}</Button>
            </div>
          </Card>
          <Card tone="danger">
            <span className="text-body-sm font-semibold text-danger">Tinted card (bad status only)</span>
          </Card>
        </div>
      </Grid>
    </div>
  );
}

// ---------------------------------------------------------------- Stats

function StatsSection() {
  const L = useL();
  const { t } = useT();
  return (
    <Grid>
      <div className="flex flex-col gap-4">
        <StatTile
          hero
          label={t('home.salesToday')}
          value={<Money value={10754} />}
          headerChip={<StatusChip tone="success" icon={Check}>{t('status.onTrack')}</StatusChip>}
          caption={L('Usual for a Friday: ₹9,700–11,800', 'শুক্রবারে সাধারণত: ₹৯,৭০০–১১,৮০০')}
          href="#stats"
        >
          <StatSplit items={[
            { label: L('Counter', 'কাউন্টার'), value: <Money value={6120} /> },
            { label: 'Zomato', value: <Money value={2890} /> },
            { label: 'Swiggy', value: <Money value={1744} /> },
          ]} />
        </StatTile>
        <StatTile hero label="Loading hero" value="" loading />
      </div>
      <StatGrid>
        <StatTile label={L('Net profit · Oct', 'নিট লাভ · অক্টো')} value={<Money value={48200} />} delta={{ value: 6, label: 'vs Sep' }} />
        <StatTile label={t('home.spentToday')} value={<Money value={3460} />} caption="12 entries" onClick={() => {}} />
        <StatTile label={L('Cash in hand', 'হাতে ক্যাশ')} value={<Money value={3000} />} chip={<StatusChip tone="warning">Not counted</StatusChip>} />
        <StatTile label={L('Cash short', 'ক্যাশ কম')} value={<Money value={1180} />} tone="danger" caption="4 days this month" />
        <StatTile label="Food cost" value="31%" delta={{ value: 2.4, label: 'vs Sep', goodWhen: 'down' }} sparkline={[30, 31, 29, 33, 32, 31, 34, 31]} />
        <StatTile label="Loading" value="" loading />
      </StatGrid>
    </Grid>
  );
}

// ---------------------------------------------------------------- Status

function StatusSection() {
  return (
    <Grid>
      <Demo title="Tones">
        <div className="flex flex-wrap gap-2">
          <StatusChip tone="success" icon={Check}>Paid</StatusChip>
          <StatusChip tone="warning">Due</StatusChip>
          <StatusChip tone="danger" icon={AlertTriangle}>Short ₹240</StatusChip>
          <StatusChip tone="info">On the way</StatusChip>
          <StatusChip tone="neutral">Draft</StatusChip>
          <StatusChip tone="brand">Incharge</StatusChip>
          <StatusChip tone="success" dot>On shift</StatusChip>
          <StatusChip tone="neutral" size="sm">sm</StatusChip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>4</Badge>
          <Badge variant="brand">Incharge</Badge>
          <Badge variant="primary">New</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Demo>
      <Demo title="Shared vocabulary (translated)">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS) as StatusKey[]).map((key) => (
            <StatusChip key={key} status={key} />
          ))}
          <StatusChip status="dayClose.matched" />
        </div>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Feedback

function FeedbackSection() {
  const L = useL();
  const [retrying, setRetrying] = React.useState(false);
  const [showSkeleton, setShowSkeleton] = React.useState(true);
  return (
    <Grid>
      <Demo title="Callouts">
        <Callout tone="warning" title={L('2 prices look wrong', '২টি দাম ভুল মনে হচ্ছে')} href="#feedback">Cabbage ₹800 a bundle? Tap to check and fix</Callout>
        <Callout tone="danger" title={L('Chicken cheese momo is out of stock', 'চিকেন চিজ মোমো স্টকে নেই')}>Marked 6:40 pm · Zomato and Swiggy paused for it</Callout>
        <Callout tone="info" title="POS syncs after 3 PM" action={<Button variant="link" size="sm">How is this calculated?</Button>}>Until then the totals stay at zero.</Callout>
        <Callout tone="success" title="Day close approved">Approved by Subham at 11:02 pm.</Callout>
        <Callout tone="neutral" icon={<img src="/bunny-logo.png" alt="" />} title="Bunny filled this in for a Saturday">Based on the last 8 Saturdays and what you have left.</Callout>
      </Demo>
      <div className="flex flex-col gap-4">
        <Demo title="Empty and error">
          <EmptyState icon={Receipt} title={L('No expenses on 27 Oct', '২৭ অক্টোবর কোনো খরচ নেই')} body={L('Anything bought today goes here.', 'আজ যা কেনা হবে তা এখানে দেখাবে।')} action={<Button leadingIcon={<Plus />}>{L('Add expense', 'খরচ যোগ করুন')}</Button>} />
          <ErrorState body="The server didn't answer in time." onRetry={() => { setRetrying(true); window.setTimeout(() => setRetrying(false), 1200); }} retrying={retrying} />
        </Demo>
        <Demo title="Toasts (bottom, above the nav, 4 s)">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast.success(L('Expense saved', 'খরচ সেভ হয়েছে'), { action: { label: 'Undo', onClick: () => toast.info('Undone') } })}>Success + Undo</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error("Couldn't save. Check the internet and try again.", { action: { label: 'Retry', onClick: () => {} } })}>Error + Retry</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info('POS sync starts at 3 PM')}>Info</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.warning('Low stock: cabbage')}>Warning</Button>
          </div>
        </Demo>
        <Demo title="Skeletons (after 300 ms)">
          <Button variant="secondary" size="sm" onClick={() => setShowSkeleton((s) => !s)}>{showSkeleton ? 'Hide' : 'Show'}</Button>
          <Delayed when={showSkeleton}>
            <div className="flex flex-col gap-3">
              <SkeletonText lines={2} />
              <SkeletonStatTiles count={2} />
              <SkeletonChart height={120} />
              <Skeleton className="h-11 w-full" />
            </div>
          </Delayed>
        </Demo>
      </div>
    </Grid>
  );
}

// ---------------------------------------------------------------- Navigation

function NavigationSection() {
  const { t } = useT();
  const L = useL();
  const [tab, setTab] = React.useState('expenses');
  const [date, setDate] = React.useState(todayIST());
  const [legacyDate, setLegacyDate] = React.useState(addDaysISO(todayIST(), -2));
  const [range, setRange] = React.useState<DateRange>(() => rangeForPreset('thisMonth'));
  return (
    <div className="flex flex-col gap-4">
      <Demo title="Page header with tabs (one row, scrolls, counts)" wide>
        <div className="overflow-hidden rounded-lg border border-border">
          <PageHeader
            title={t('nav.money')}
            caption="Fri 27 Oct · Store"
            subtitle="Sales, expenses and cash for the store"
            sticky={false}
            actions={<><IconButton label={t('common.search')} icon={<Search />} /><IconButton label={t('nav.inbox')} icon={<Bell />} badge={2} /></>}
            primaryAction={<Button leadingIcon={<Plus />}>{t('expense.add')}</Button>}
          >
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="Money sections" className="border-b-0">
                <TabsTrigger value="sales">{L('Sales', 'বিক্রি')}</TabsTrigger>
                <TabsTrigger value="expenses">{L('Expenses', 'খরচ')}</TabsTrigger>
                <TabsTrigger value="cash" badge={2}>{L('Cash & Paytm', 'ক্যাশ ও পেটিএম')}</TabsTrigger>
                <TabsTrigger value="payouts">{L('Payouts', 'পেমেন্ট')}</TabsTrigger>
                <TabsTrigger value="loans">{L('Loans', 'ঋণ')}</TabsTrigger>
                <TabsTrigger value="off" disabled>Disabled</TabsTrigger>
              </TabsList>
            </Tabs>
          </PageHeader>
          <div className="p-4 text-body-sm text-text-2">Active tab: {tab}</div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <PageHeader title="Employee" onBack={() => toast.info('Back')} actions={<IconButton label={t('common.moreActions')} icon={<MoreHorizontal />} />} sticky={false} />
        </div>
      </Demo>
      <Grid>
        <Demo title="Date strip (7 days + calendar sheet)">
          <div className="-mx-4 border-y border-border bg-surface px-2 py-2">
            <DateStrip value={date} onChange={setDate} max={todayIST()} />
          </div>
          <span className="num text-label text-text-3">value = {date}</span>
          <DateStrip value={date} onChange={setDate} showMonthLabel max={todayIST()} hideCalendarButton />
        </Demo>
        <Demo title="Date range chip + DateSelector (legacy props)">
          <div>
            <DateRangeChip value={range} onChange={setRange} />
          </div>
          <span className="num text-label text-text-3">{range.preset}: {range.from} → {range.to}</span>
          <DateSelector selectedDate={legacyDate} onDateChange={setLegacyDate} />
        </Demo>
      </Grid>
    </div>
  );
}

// ---------------------------------------------------------------- Overlays

function OverlaysSection() {
  const { t } = useT();
  const L = useL();
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState(false);
  const [view, setView] = React.useState<'payslip' | 'payout'>('payslip');
  const [amount, setAmount] = React.useState<number | null>(null);
  const [paidFrom, setPaidFrom] = React.useState<'cash' | 'paytm' | 'split'>('cash');
  const [picker, setPicker] = React.useState(false);
  const [multi, setMulti] = React.useState<string[]>(['chicken']);
  const [multiOpen, setMultiOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState(false);
  const [answer, setAnswer] = React.useState('');

  return (
    <Grid>
      <Demo title="ResponsiveModal (sheet < 768, dialog >= 768)">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => { setAmount(null); setOpen(true); }}>{t('expense.add')}</Button>
          <Button variant="secondary" onClick={() => { setView('payslip'); setDetail(true); }}>Payslip (swap content)</Button>
        </div>
        <p className="text-label text-text-3">Type an amount, then try to close: it asks before discarding.</p>
        <ResponsiveModal
          open={open}
          onOpenChange={setOpen}
          title={t('expense.add')}
          dirty={amount !== null}
          footer={
            <>
              <Button variant="secondary" size="lg">{t('expense.saveAnother')}</Button>
              <Button size="lg" className="flex-1" onClick={() => { setOpen(false); toast.success('Expense saved'); }}>{t('expense.save')}</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <VoiceButton variant="row" label={t('voice.sayItInstead')} prompt='যেমন: "ajke 3 kg chicken 600 taka"' onText={(text) => { toast.info(text); }} />
            <SegmentedControl aria-label="For" value="store" onValueChange={() => {}} options={[{ value: 'store', label: L('Store', 'স্টোর') }, { value: 'production', label: L('Production', 'প্রোডাকশন') }]} />
            <Field label={L('What was it for?', 'কীসের জন্য?')}>
              <PickerField title={L('Choose an item', 'জিনিস বেছে নিন')} items={ITEMS} value="chicken" onValueChange={() => {}} leadingIcon={<Search />} />
            </Field>
            <Field label={t('money.amount')}>
              <MoneyInput value={amount} onValueChange={(n) => setAmount(n)} />
            </Field>
            <Field label={t('money.paidFrom')}>
              <SegmentedControl aria-label={t('money.paidFrom')} value={paidFrom} onValueChange={setPaidFrom} options={[
                { value: 'cash', label: t('money.cash') },
                { value: 'paytm', label: t('money.paytm') },
                { value: 'split', label: t('money.split') },
              ]} />
            </Field>
          </div>
        </ResponsiveModal>
        <ResponsiveModal
          open={detail}
          onOpenChange={setDetail}
          size="detail"
          title={view === 'payslip' ? 'October payslip · Nabendu' : 'Add payout'}
          onBack={view === 'payout' ? () => setView('payslip') : undefined}
          footer={
            view === 'payslip' ? (
              <Button size="lg" className="flex-1" leadingIcon={<Plus />} onClick={() => setView('payout')}>Add payout</Button>
            ) : (
              <Button size="lg" className="flex-1" onClick={() => { setDetail(false); toast.success('Payout saved'); }}>{t('common.save')}</Button>
            )
          }
        >
          {view === 'payslip' ? (
            <ListGroup>
              <ListRow density="compact" title="26 days × ₹450" amount={11700} />
              <ListRow density="compact" title="Advance" amount={-2000} />
              <ListRow density="compact" title="Paid so far" amount={5000} />
              <ListRow density="compact" title="Due" trailing={<StatusChip status="pay.due" />} amount={4700} />
            </ListGroup>
          ) : (
            <Field label={t('money.amount')}>
              <MoneyInput value={4700} onValueChange={() => {}} />
            </Field>
          )}
        </ResponsiveModal>
      </Demo>
      <Demo title="confirm() / promptText() (replace window dialogs)">
        <div className="flex flex-wrap gap-2">
          <Button variant="danger-ghost" leadingIcon={<Trash2 />} onClick={async () => {
            const ok = await confirm({ title: 'Delete this expense?', body: '₹600 · Chicken · 27 Oct. This can be undone for a few seconds.', confirmLabel: 'Delete expense', tone: 'danger' });
            setAnswer(ok ? 'Deleted' : 'Kept');
          }}>Delete expense</Button>
          <Button variant="secondary" onClick={async () => {
            const reason = await promptText({ title: 'Reject day close', body: 'The store incharge sees this reason.', label: 'Reason', required: true, multiline: true, confirmLabel: 'Reject', tone: 'danger' });
            setAnswer(reason === null ? 'Cancelled' : `Reason: ${reason}`);
          }}>Reject with reason</Button>
          <Button variant="secondary" onClick={async () => {
            const ok = await confirm({ title: 'Restore this backup?', body: 'Everything after 20 Oct is replaced.', confirmLabel: 'Restore', tone: 'danger', requireText: 'RESTORE' });
            setAnswer(ok ? 'Restored' : 'Not restored');
          }}>Typed confirmation</Button>
        </div>
        {answer && <p className="text-body-sm text-text-2">Answer: {answer}</p>}
      </Demo>
      <Demo title="Picker sheet">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<Package />} onClick={() => setPicker(true)}>Single pick</Button>
          <Button variant="secondary" leadingIcon={<Users />} onClick={() => setMultiOpen(true)}>Multi pick ({multi.length})</Button>
        </div>
        <PickerSheet open={picker} onOpenChange={setPicker} title="Choose an item" items={ITEMS} value="cabbage" onSelect={(v) => toast.info(`Picked ${v}`)} onCreate={(q) => toast.success(`Added ${q}`)} />
        <PickerSheet open={multiOpen} onOpenChange={setMultiOpen} title="Who does this cover?" items={ITEMS.slice(0, 7)} multiple value={multi} onChange={setMulti} />
      </Demo>
      <Demo title="Plain dialog (desktop)">
        <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>How profit is worked out</DialogTitle>
              <DialogDescription>Sales minus food, salaries, rent and app commission, with rent and salaries spread over the month.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setDialog(false)}>{t('common.done')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Data

const CHART_DATA = Array.from({ length: 14 }, (_, i) => ({
  day: `${i * 2 + 1} Oct`,
  sales: 9000 + Math.round(Math.sin(i / 1.6) * 1800 + i * 120),
  costs: 6200 + Math.round(Math.cos(i / 2) * 600 + i * 40),
  lastMonth: 8800 + Math.round(Math.sin(i / 1.8) * 1200),
}));

const PEOPLE = [
  { name: 'Nabendu', role: 'Store incharge', due: 4700, status: 'pay.due' as StatusKey },
  { name: 'Production incharge', role: 'Production', due: 0, status: 'pay.paid' as StatusKey },
  { name: 'Kitchen crew 1', role: 'Production', due: 2300, status: 'pay.partlyPaid' as StatusKey },
];

function DataSection() {
  const [sort, setSort] = React.useState<SortDirection>('desc');
  const rows = [...PEOPLE].sort((a, b) => (sort === 'asc' ? a.due - b.due : b.due - a.due));
  return (
    <Grid>
      <Demo title="Chart (tokens only, dashed previous period)" wide>
        <ChartLegendChips items={[
          { label: 'Sales', color: CHART_COLORS.primary },
          { label: 'Costs', color: CHART_COLORS.secondary },
          { label: 'Last month', color: CHART_COLORS.previous, dashed: true },
        ]} />
        <ChartContainer
          className="aspect-auto h-[200px] w-full"
          config={{ sales: { label: 'Sales', color: CHART_COLORS.primary }, costs: { label: 'Costs', color: CHART_COLORS.secondary }, lastMonth: { label: 'Last month', color: CHART_COLORS.previous } }}
          role="img"
          aria-label="Daily sales stay above daily costs all month, with weekend peaks"
        >
          <LineChart data={CHART_DATA} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis dataKey="day" {...chartAxisProps} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...chartAxisProps} width={44} tickFormatter={(v) => formatCompactINR(Number(v))} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="lastMonth" stroke="var(--color-lastMonth)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            <Line dataKey="sales" stroke="var(--color-sales)" strokeWidth={2.5} dot={false} />
            <Line dataKey="costs" stroke="var(--color-costs)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ChartContainer>
      </Demo>
      <Demo title="Channel mix (share bars)">
        <ShareBars items={[
          { label: 'Counter', value: 178100, color: CHANNEL_COLORS.counter },
          { label: 'Zomato', value: 84300, color: CHANNEL_COLORS.zomato },
          { label: 'Swiggy', value: 50000, color: CHANNEL_COLORS.swiggy },
        ]} />
      </Demo>
      <Demo title="Progress and avatars">
        <div className="flex items-baseline gap-1.5">
          <span className="num text-title-lg font-semibold">1,240</span>
          <span className="text-label text-text-3">of 1,300 planned pieces</span>
        </div>
        <Progress value={95} aria-label="Made 1,240 of 1,300 pieces" />
        <Progress value={100} tone="success" aria-label="Done" />
        <div className="flex items-end gap-3">
          <InitialsAvatar name="Subham Tewari" size={32} />
          <InitialsAvatar name="Nabendu Bera" size={40} status="success" />
          <InitialsAvatar name="Aniket" size={56} />
          <InitialsAvatar name="Rider Das" size={64} />
        </div>
      </Demo>
      <Demo title="Table (desktop, sortable)" wide>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead numeric sortDirection={sort} onSort={() => setSort(sort === 'asc' ? 'desc' : 'asc')}>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.name}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-text-2">{p.role}</TableCell>
                <TableCell numeric><Money value={p.due} /></TableCell>
                <TableCell><StatusChip status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Demo>
    </Grid>
  );
}

// ---------------------------------------------------------------- Shared components

function Thrower(): JSX.Element {
  throw new Error('Demo error from the UI gallery');
}

function SharedSection() {
  const L = useL();
  const [ids, setIds] = React.useState<string[]>(['E002']);
  const [crash, setCrash] = React.useState(false);
  return (
    <Grid>
      <Demo title="VoiceButton">
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton label="বলুন" onText={(text) => { toast.info(text); }} />
          <VoiceButton onText={(text) => { toast.info(text); }} />
        </div>
        <VoiceButton variant="row" label={L('Say it instead', 'মুখে বলুন')} prompt='যেমন: "ajke 3 kg chicken 600 taka"' onText={(text) => { toast.info(text); }} />
        <p className="text-caption text-text-3">Hidden when this browser has no speech recognition.</p>
      </Demo>
      <Demo title="EmployeeMultiSelect">
        <EmployeeMultiSelect
          employees={[
            { employeeId: 'E001', name: 'Nabendu' },
            { employeeId: 'E002', name: 'Kitchen crew 1' },
            { employeeId: 'E003', name: 'Store crew 2' },
          ] as never}
          selectedIds={ids}
          onChange={setIds}
        />
      </Demo>
      <Demo title="UpdateAvailableBanner, ImageWithFallback, LoadingBar">
        <div className="-mx-4 overflow-hidden">
          <UpdateBanner version="1.16.0" onDismiss={() => toast.info('Dismissed')} />
        </div>
        <LoadingBar />
        <div className="flex gap-3">
          <ImageWithFallback src="/bunny-logo.png" alt="Bunny logo" className="size-16 object-contain" />
          <ImageWithFallback src="/missing-image.png" alt="Missing" className="size-16" />
        </div>
      </Demo>
      <Demo title="LoadingSkeleton variants">
        <div className="-mx-4 overflow-hidden">
          <CompactLoadingSkeleton />
        </div>
        <SectionSkeleton minHeight={200} />
      </Demo>
      <Demo title="ErrorBoundary fallback" wide>
        <Button variant="secondary" onClick={() => setCrash((c) => !c)}>{crash ? 'Hide error screen' : 'Show error screen'}</Button>
        {crash && (
          <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
            <ErrorBoundary>
              <Thrower />
            </ErrorBoundary>
          </div>
        )}
      </Demo>
    </Grid>
  );
}

export const SECTIONS: { id: string; title: string; note?: string; Component: React.ComponentType }[] = [
  { id: 'tokens', title: 'Tokens', note: 'Colours from globals.css (:root), radius and elevation.', Component: TokensSection },
  { id: 'type', title: 'Type', note: 'Inter + Noto Sans Bengali / Devanagari, self-hosted. Nothing under 12 px.', Component: TypeSection },
  { id: 'buttons', title: 'Buttons', Component: ButtonsSection },
  { id: 'inputs', title: 'Inputs', note: '48 px fields, label above, help or error below.', Component: InputsSection },
  { id: 'choices', title: 'Choices', Component: ChoicesSection },
  { id: 'lists', title: 'Lists and cards', note: 'ListRow is the default way to show records on phones.', Component: ListsSection },
  { id: 'stats', title: 'Stat tiles', Component: StatsSection },
  { id: 'status', title: 'Status', Component: StatusSection },
  { id: 'feedback', title: 'Feedback', Component: FeedbackSection },
  { id: 'navigation', title: 'Navigation and dates', Component: NavigationSection },
  { id: 'overlays', title: 'Sheets and dialogs', Component: OverlaysSection },
  { id: 'data', title: 'Data', Component: DataSection },
  { id: 'shared', title: 'Shared components', note: 'Restyled with the same props and behaviour.', Component: SharedSection },
];

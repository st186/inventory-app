import { Suspense, lazy, memo, useState } from 'react';
import { ChevronDown, Store } from 'lucide-react';
import type * as api from '../utils/api';
import { SelectChip } from './ui/chip';
import { cn } from './ui/utils';
import { useT } from '../utils/i18n';

// The sheet's code loads on the first tap (the chip itself is on screen from the first frame).
const PickerSheet = lazy(() => import('./ui/picker-sheet').then((m) => ({ default: m.PickerSheet })));

// The owner's store choice for the whole app (Home, Insights, Money, Team, reports). Shown only
// when there is more than one store: a chip under the top bar on phones and tablets, a full-width
// switcher in the desktop sidebar. Opens a searchable sheet.

type StoreSelectorProps = {
  stores: api.Store[];
  selectedStoreId: string | null;
  onStoreChange: (storeId: string | null) => void;
  showAllStores?: boolean;
  variant?: 'chip' | 'sidebar';
};

export const StoreSelector = memo(function StoreSelector({ stores, selectedStoreId, onStoreChange, showAllStores = true, variant = 'chip' }: StoreSelectorProps) {
  const { t } = useT();
  const [open, setOpenRaw] = useState(false);
  const [mounted, setMounted] = useState(false);
  const setOpen = (next: boolean) => {
    if (next) setMounted(true);
    setOpenRaw(next);
  };
  const selected = stores.find((s) => s.id === selectedStoreId);
  const label = selected ? selected.name : t('shell.allStores');
  const items = [
    ...(showAllStores ? [{ value: 'all', label: t('shell.allStores'), description: t('shell.storesCount', { n: stores.length }) }] : []),
    ...stores.map((s) => ({ value: s.id, label: s.name, description: s.location || undefined })),
  ];

  return (
    <>
      {variant === 'chip' ? (
        <SelectChip
          onClick={() => setOpen(true)}
          leadingIcon={<Store aria-hidden="true" />}
          trailingIcon={<ChevronDown aria-hidden="true" />}
          aria-label={`${t('shell.chooseStore')}: ${label}`}
        >
          {label}
        </SelectChip>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${t('shell.chooseStore')}: ${label}`}
          className={cn(
            'flex min-h-11 w-full items-center gap-2.5 rounded-md border border-border-strong bg-surface px-3 text-left outline-none',
            'transition-colors duration-(--dur-fast) hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Store className="size-5 shrink-0 text-text-2" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-caption text-text-3">{t('shell.store')}</span>
            <span className="truncate text-body-sm font-semibold text-text">{label}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-3" aria-hidden="true" />
        </button>
      )}
      {mounted && (
        <Suspense fallback={null}>
          <PickerSheet
            open={open}
            onOpenChange={setOpen}
            title={t('shell.chooseStore')}
            items={items}
            value={selectedStoreId || 'all'}
            onSelect={(value) => {
              onStoreChange(value === 'all' ? null : value);
              setOpen(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
});

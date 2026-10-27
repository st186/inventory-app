import { Boxes } from 'lucide-react';

// Menu entry to the Equipment & assets register for managers and incharges, who don't get the
// owner's "Investments & Assets" page. One component so App.tsx needs a single line per menu;
// each variant matches the buttons around it.
type Variant = 'staff-desktop' | 'staff-mobile' | 'manager-desktop' | 'manager-mobile';

const STYLE: Record<Variant, { base: string; on: string; off: string; icon: string }> = {
  'staff-desktop': {
    base: 'flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2',
    on: 'bg-white text-orange-600 border-white shadow-lg',
    off: 'bg-white/20 text-white border-white/30 hover:bg-white/30',
    icon: 'w-4 h-4',
  },
  'staff-mobile': {
    base: 'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all',
    on: 'bg-white text-orange-600',
    off: 'bg-white/20 text-white hover:bg-white/30',
    icon: 'w-5 h-5',
  },
  'manager-desktop': {
    base: 'flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105',
    on: 'bg-white text-rose-600 shadow-lg font-semibold',
    off: 'bg-white/10 text-white hover:bg-white/20 border border-white/20',
    icon: 'w-4 h-4',
  },
  'manager-mobile': {
    base: 'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
    on: 'bg-[#FFE4CC] text-gray-800',
    off: 'bg-gray-50 text-gray-700 hover:bg-[#FFF5EE]',
    icon: 'w-5 h-5',
  },
};

export function EquipmentNavButton({ variant, active, onClick }: { variant: Variant; active: boolean; onClick: () => void }) {
  const s = STYLE[variant];
  return (
    <button type="button" onClick={onClick} className={`${s.base} ${active ? s.on : s.off}`}>
      <Boxes className={s.icon} />
      <span className={variant === 'manager-desktop' ? 'hidden xl:inline' : undefined}>Equipment</span>
    </button>
  );
}

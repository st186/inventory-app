import { Target, Users } from 'lucide-react';

// Nav buttons for "Team KPIs" and "My KPIs", styled to match each of App.tsx's four menus, so the
// App.tsx change is one line per menu.
type Variant = 'employee-desktop' | 'employee-mobile' | 'manager-desktop' | 'manager-mobile';
const CLASSES: Record<Variant, { base: string; on: string; off: string; icon: string }> = {
  'employee-desktop': { base: 'flex items-center gap-2 px-4 py-2 rounded-xl transition-all border-2', on: 'bg-white text-orange-600 border-white shadow-lg', off: 'bg-white/20 text-white border-white/30 hover:bg-white/30', icon: 'w-4 h-4' },
  'employee-mobile': { base: 'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all', on: 'bg-white text-orange-600', off: 'bg-white/20 text-white hover:bg-white/30', icon: 'w-5 h-5' },
  'manager-desktop': { base: 'flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 transform hover:scale-105', on: 'bg-white text-orange-600 shadow-lg font-semibold', off: 'bg-white/10 text-white hover:bg-white/20 border border-white/20', icon: 'w-4 h-4' },
  'manager-mobile': { base: 'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors', on: 'bg-orange-100 text-gray-800', off: 'bg-gray-50 text-gray-700 hover:bg-orange-50', icon: 'w-5 h-5' },
};

export function KpiNavButton({ view, active, variant, onSelect }: { view: 'team-kpis' | 'my-kpis'; active: boolean; variant: Variant; onSelect: (view: 'team-kpis' | 'my-kpis') => void }) {
  const c = CLASSES[variant];
  const Icon = view === 'team-kpis' ? Users : Target;
  const label = view === 'team-kpis' ? 'Team KPIs' : 'My KPIs';
  return (
    <button onClick={() => onSelect(view)} className={`${c.base} ${active ? c.on : c.off}`}>
      <Icon className={c.icon} />
      <span className={variant === 'manager-desktop' ? 'hidden xl:inline' : undefined}>{label}</span>
    </button>
  );
}

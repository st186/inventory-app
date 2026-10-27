// Pieces several Insights tabs share: chart tooltips, the period picker, the "vs last period"
// renderers and the lazily loaded screens more than one tab opens. Moved verbatim from
// Analytics.tsx (WP2 step 1).
import { Calendar, ArrowUp, ArrowDown } from 'lucide-react';
import { type TooltipProps } from 'recharts';
import { getTodayIST } from '../../../utils/timezone';
import { type AnalyticsData, type TimeFilterChoice, TIME_FILTER_OPTIONS } from '../useAnalyticsData';





// Custom Tooltip Component for Bar Charts
export const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 ₹{entry.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

// Custom Tooltip Component for Pie Charts
export const CustomPieTooltip = ({ active, payload }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 const data = payload[0];
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <div className="flex items-center gap-2 mb-2">
 <div 
 className="w-4 h-4 rounded-full" 
 style={{ backgroundColor: data.payload.fill }}
 />
 <p className="text-gray-900" style={{ fontSize: '14px', fontWeight: '600' }}>
 {data.name}
 </p>
 </div>
 <div className="space-y-1">
 <div className="flex justify-between gap-4">
 <span className="text-gray-600" style={{ fontSize: '13px' }}>Amount:</span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 ₹{data.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
 </span>
 </div>
 <div className="flex justify-between gap-4">
 <span className="text-gray-600" style={{ fontSize: '13px' }}>Percentage:</span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {data.payload.percentage}%
 </span>
 </div>
 </div>
 </div>
 );
 }
 return null;
};

// Custom Tooltip for Production (Quantity in pieces)
export const ProductionTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {entry.value.toLocaleString()} pcs
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

// Custom Tooltip for Wastage (Weight in kg)
export const WastageTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
 if (active && payload && payload.length) {
 return (
 <div className="bg-white px-4 py-3 rounded-xl shadow-lg border-2 border-gray-100">
 <p className="text-gray-900 mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>{label}</p>
 {payload.map((entry: any, index: number) => (
 <div key={index} className="flex items-center gap-2 mt-1">
 <div 
 className="w-3 h-3 rounded-full" 
 style={{ backgroundColor: entry.color }}
 />
 <span className="text-gray-700" style={{ fontSize: '13px', fontWeight: '500' }}>
 {entry.name}:
 </span>
 <span className="text-gray-900" style={{ fontSize: '13px', fontWeight: '700' }}>
 {entry.value.toFixed(2)} kg
 </span>
 </div>
 ))}
 </div>
 );
 }
 return null;
};

// Date-range filter used across the Analytics tabs. Mobile gets a compact
// dropdown (the pill row clips/truncates on narrow screens); desktop keeps
// the pill row.
export function TimeFilterBar({ value, onChange, range, onRangeChange }: {
 value: TimeFilterChoice;
 onChange: (v: TimeFilterChoice) => void;
 range: { from: string; to: string };
 onRangeChange: (r: { from: string; to: string }) => void;
}) {
 return (
 <div className="flex flex-col gap-2 w-full sm:w-auto min-w-0">
 <select
 value={value}
 onChange={(e) => onChange(e.target.value as TimeFilterChoice)}
 className="sm:hidden w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
 >
 {TIME_FILTER_OPTIONS.map((filter) => (
 <option key={filter.value} value={filter.value}>{filter.label}</option>
 ))}
 </select>
 <div className="hidden sm:flex gap-2 overflow-x-auto pb-0">
 {TIME_FILTER_OPTIONS.map((filter) => (
 <button
 key={filter.value}
 onClick={() => onChange(filter.value)}
 className={`px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
 value === filter.value
 ? 'bg-gray-900 text-white'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
 }`}
 >
 {filter.label}
 </button>
 ))}
 </div>
 {value === 'custom' && (
 <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2">
 <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
 <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
 From
 <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onRangeChange({ ...range, from: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
 </label>
 <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
 To
 <input type="date" value={range.to} min={range.from} max={getTodayIST()} onChange={(e) => e.target.value && onRangeChange({ ...range, to: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white" />
 </label>
 </div>
 )}
 </div>
 );
}

// The small "+x% vs last period" lines and the chart legend that tells previous-period
// (dashed) series apart.
export function makeRenderers(d: AnalyticsData) {
 const { pctChange, getPreviousPeriodLabel } = d;

 const renderPctChange = (current: number, previous: number, goodDirection: 'up' | 'down' = 'up') => {
 const change = pctChange(current, previous);
 if (change === null) return null;
 const isGood = goodDirection === 'up' ? change >= 0 : change <= 0;
 const rounded = Math.abs(change) < 0.1 ? '0.0' : Math.abs(change).toFixed(1);
 return (
 <div className={`flex items-center gap-1 text-xs mt-0.5 ${isGood ? 'text-emerald-700' : 'text-red-700'}`}>
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{rounded}% {getPreviousPeriodLabel()}</span>
 </div>
 );
 };
 // Same as renderPctChange, but for the Overview cards' saturated gradient backgrounds -
 // dark-on-dark emerald/red text there would be unreadable, so this uses a translucent
 // white pill instead and leans on the arrow direction rather than a color swap for
 // good/bad (the card's own background color already carries that signal there).
 const renderPctChangeOnColor = (current: number, previous: number) => {
 // A zero previous-period value (e.g. no discrepancies logged last month) makes "%
 // change" undefined, not zero - pctChange returns null there and the card used to
 // just show nothing, which read as "comparison forgotten" rather than "there wasn't
 // one to compare against". Show that explicitly instead of going silent.
 if (!previous) {
 if (!current) return null; // both periods are genuinely zero - nothing worth saying
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 <span>New this period {getPreviousPeriodLabel()}</span>
 </div>
 );
 }
 const change = pctChange(current, previous);
 if (change === null) return null;
 const rounded = Math.abs(change) < 0.1 ? '0.0' : Math.abs(change).toFixed(1);
 return (
 <div className="inline-flex items-center gap-1 text-[11px] font-medium mt-1.5 bg-white/20 rounded-full px-2 py-0.5 text-white">
 {change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
 <span>{rounded}% {getPreviousPeriodLabel()}</span>
 </div>
 );
 };

 // Recharts' default <Legend> draws every entry as the same solid line swatch - it
 // ignores strokeDasharray, so a "Revenue" entry and its dashed "Revenue (prev period)"
 // sibling render as two identical green marks with no way to tell which is which just
 // from the legend. This custom renderer draws the swatch itself, dashed for any entry
 // whose dataKey is the zipPrev "prev_X" convention used across the comparison charts.
 const renderPrevAwareLegend = (props: any) => {
 const payload = props?.payload;
 if (!payload || payload.length === 0) return null;
 return (
 <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2 list-none p-0">
 {payload.map((entry: any, index: number) => {
 const isPrev = typeof entry.dataKey === 'string' && entry.dataKey.startsWith('prev_');
 return (
 <li key={`legend-${entry.dataKey || entry.value || index}`} className="flex items-center gap-1.5" style={{ fontSize: 12 }}>
 <svg width="18" height="10" className="flex-shrink-0" aria-hidden="true">
 <line
 x1="0" y1="5" x2="18" y2="5"
 stroke={entry.color}
 strokeWidth={2}
 strokeDasharray={isPrev ? '4 3' : undefined}
 />
 </svg>
 <span style={{ color: entry.color }}>{entry.value}</span>
 </li>
 );
 })}
 </ul>
 );
 };
 return { renderPctChange, renderPctChangeOnColor, renderPrevAwareLegend };
}

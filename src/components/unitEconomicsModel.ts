// The parts of Unit Economics that Analytics needs before the tab itself is opened (the P&L
// smoothing and the cost-line keys). Kept apart from UnitEconomics.tsx so that screen, and the
// chart library it draws with, can load only when its tab is chosen.
import type { PnlBreakdown } from '../utils/pnl';

export type { PnlBreakdown };

// Swap month-end salaries, rent and electricity for their day-by-day share of the period
// (utils/dailyCostSmoothing.ts), so a month in progress isn't flattered by bills not yet paid.
export function normalizePnl(p: PnlBreakdown, accrued: { staff: number; occupancy: number }): PnlBreakdown {
  const staff = p.staff - (p.staffSmoothable || 0) + accrued.staff;
  const occupancy = p.occupancy - (p.occupancySmoothable || 0) + accrued.occupancy;
  return { ...p, staff, occupancy, netProfit: p.netProfit - (staff - p.staff) - (occupancy - p.occupancy) };
}

// Cost lines on the ladder that open a detail view when tapped.
export type CostLineKey =
  | 'food' | 'packaging' | 'commission' | 'ads' | 'marketing' | 'staff'
  | 'occupancy' | 'otherOpex' | 'depreciation' | 'interest' | 'shortages';

export type UnitEconomicsTrendPoint = { month: string; label: string; partial: boolean; pnl: PnlBreakdown };

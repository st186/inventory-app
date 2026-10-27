// Where the Home screens (and the cards they share with other screens) get their data: the real
// api functions by default, or the dev preview's mock (src/gallery/HomePreview.tsx) so the screens
// can be looked at without signing in. Same calls as before - this only names them in one place.
import { createContext, useContext, type ReactNode } from 'react';
import * as api from '../../utils/api';
import * as kpi from '../kpi/kpiApi';
import * as workplace from '../workplace/workplaceApi';

export type HomeData = {
  // Shift clock (server attendance.ts)
  getShiftToday: typeof kpi.getShiftToday;
  punch: typeof kpi.punch;
  confirmDetected: typeof kpi.confirmDetected;
  dismissDetected: typeof kpi.dismissDetected;
  getTeamPending: typeof kpi.getTeamPending;
  saveShiftConsent: typeof kpi.saveShiftConsent;
  getTeamKpis: typeof kpi.getTeamKpis;
  // Workplace photos
  getMyChecks: typeof workplace.getMyChecks;
  getWorkplaceAccess: typeof workplace.getAccess;
  getWorkplaceReview: typeof workplace.getReview;
  // Profile
  getMyProfile: typeof api.getMyProfile;
  updateMyProfile: typeof api.updateMyProfile;
  // Brief and forecast
  getAiBrief: typeof api.getAiBrief;
  getInsightsOverview: typeof api.getInsightsOverview;
  // Money and people
  getPayouts: typeof api.getPayouts;
  getEmployees: typeof api.getEmployees;
  getArchivedEmployees: typeof api.getArchivedEmployees;
  getOverheads: typeof api.getOverheads;
  getOnlineLoans: typeof api.getOnlineLoans;
  fetchCashTopupRequests: typeof api.fetchCashTopupRequests;
  getAllLeaves: typeof api.getAllLeaves;
  getAllRecalibrationsForApproval: typeof api.getAllRecalibrationsForApproval;
  getEmployeesByIncharge: typeof api.getEmployeesByIncharge;
  getTimesheets: typeof api.getTimesheets;
  // Stock
  getStockOuts: typeof api.getStockOuts;
  getStockWastageEntry: typeof api.getStockWastageEntry;
  /** The rider's rides screen; the preview swaps in a placeholder (it polls the server). */
  renderRiderTrips?: (props: { stockRequests: api.ProductionRequest[]; canDispatch: boolean; stores: { id: string; name: string }[]; defaultStoreId: string | null }) => ReactNode;
};

export const realHomeData: HomeData = {
  getShiftToday: kpi.getShiftToday,
  punch: kpi.punch,
  confirmDetected: kpi.confirmDetected,
  dismissDetected: kpi.dismissDetected,
  getTeamPending: kpi.getTeamPending,
  saveShiftConsent: kpi.saveShiftConsent,
  getTeamKpis: kpi.getTeamKpis,
  getMyChecks: workplace.getMyChecks,
  getWorkplaceAccess: workplace.getAccess,
  getWorkplaceReview: workplace.getReview,
  getMyProfile: api.getMyProfile,
  updateMyProfile: api.updateMyProfile,
  getAiBrief: api.getAiBrief,
  getInsightsOverview: api.getInsightsOverview,
  getPayouts: api.getPayouts,
  getEmployees: api.getEmployees,
  getArchivedEmployees: api.getArchivedEmployees,
  getOverheads: api.getOverheads,
  getOnlineLoans: api.getOnlineLoans,
  fetchCashTopupRequests: api.fetchCashTopupRequests,
  getAllLeaves: api.getAllLeaves,
  getAllRecalibrationsForApproval: api.getAllRecalibrationsForApproval,
  getEmployeesByIncharge: api.getEmployeesByIncharge,
  getTimesheets: api.getTimesheets,
  getStockOuts: api.getStockOuts,
  getStockWastageEntry: api.getStockWastageEntry,
};

const HomeDataContext = createContext<HomeData>(realHomeData);

export function HomeDataProvider({ value, children }: { value: HomeData; children?: ReactNode }) {
  return <HomeDataContext.Provider value={value}>{children}</HomeDataContext.Provider>;
}

export const useHomeData = () => useContext(HomeDataContext);

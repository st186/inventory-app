// The server calls the Team screens make - the same functions from utils/api.ts, kpi/kpiApi.ts
// and workplace/workplaceApi.ts, called with the same arguments.
//
// One addition, for development only: the Team preview page (team-preview.html, src/gallery)
// sets globalThis.__BUNNY_TEAM_PREVIEW__ to made-up answers so the screens can be looked at
// without signing in. `import.meta.env.DEV` is false in a production build, so the check folds
// away and every call goes straight to the real function.
import * as api from '../../utils/api';
import * as kpi from '../kpi/kpiApi';
import * as wp from '../workplace/workplaceApi';

type Fn = (...args: never[]) => unknown;
export type TeamPreviewMock = {
  api?: Partial<Record<keyof typeof api, Fn>>;
  kpi?: Partial<Record<keyof typeof kpi, Fn>>;
  workplace?: Partial<Record<keyof typeof wp, Fn>>;
};

function previewMock(): TeamPreviewMock | undefined {
  if (!import.meta.env.DEV) return undefined;
  return (globalThis as { __BUNNY_TEAM_PREVIEW__?: TeamPreviewMock }).__BUNNY_TEAM_PREVIEW__;
}

function wrap<F extends Fn>(group: keyof TeamPreviewMock, name: string, real: F): F {
  return ((...args: Parameters<F>) => {
    const fake = (previewMock()?.[group] as Record<string, Fn> | undefined)?.[name] as F | undefined;
    return (fake ?? real)(...args);
  }) as F;
}

export const teamApi = {
  // People
  getAllEmployees: wrap('api', 'getAllEmployees', api.getAllEmployees),
  getEmployees: wrap('api', 'getEmployees', api.getEmployees),
  getEmployeesByManager: wrap('api', 'getEmployeesByManager', api.getEmployeesByManager),
  getEmployeesByIncharge: wrap('api', 'getEmployeesByIncharge', api.getEmployeesByIncharge),
  getManagersByClusterHead: wrap('api', 'getManagersByClusterHead', api.getManagersByClusterHead),
  getArchivedEmployees: wrap('api', 'getArchivedEmployees', api.getArchivedEmployees),
  getEmployeeDocuments: wrap('api', 'getEmployeeDocuments', api.getEmployeeDocuments),
  getStores: wrap('api', 'getStores', api.getStores),
  getProductionHouses: wrap('api', 'getProductionHouses', api.getProductionHouses),
  createUnifiedEmployee: wrap('api', 'createUnifiedEmployee', api.createUnifiedEmployee),
  updateUnifiedEmployee: wrap('api', 'updateUnifiedEmployee', api.updateUnifiedEmployee),
  deleteUnifiedEmployee: wrap('api', 'deleteUnifiedEmployee', api.deleteUnifiedEmployee),
  restoreArchivedEmployee: wrap('api', 'restoreArchivedEmployee', api.restoreArchivedEmployee),
  resetEmployeePassword: wrap('api', 'resetEmployeePassword', api.resetEmployeePassword),
  forcePasswordReset: wrap('api', 'forcePasswordReset', api.forcePasswordReset),
  updateEmployeeRole: wrap('api', 'updateEmployeeRole', api.updateEmployeeRole),
  updateEmployeeAssignments: wrap('api', 'updateEmployeeAssignments', api.updateEmployeeAssignments),
  updateEmployeeStore: wrap('api', 'updateEmployeeStore', api.updateEmployeeStore),
  updateEmployeeDesignation: wrap('api', 'updateEmployeeDesignation', api.updateEmployeeDesignation),
  assignInchargeToEmployee: wrap('api', 'assignInchargeToEmployee', api.assignInchargeToEmployee),
  assignManagerToEmployee: wrap('api', 'assignManagerToEmployee', api.assignManagerToEmployee),
  migrateEmployeeStores: wrap('api', 'migrateEmployeeStores', api.migrateEmployeeStores),
  syncDesignations: wrap('api', 'syncDesignations', api.syncDesignations),
  // Pay
  getPayouts: wrap('api', 'getPayouts', api.getPayouts),
  addPayouts: wrap('api', 'addPayouts', api.addPayouts),
  updatePayout: wrap('api', 'updatePayout', api.updatePayout),
  deletePayout: wrap('api', 'deletePayout', api.deletePayout),
  getSalaryAdvances: wrap('api', 'getSalaryAdvances', api.getSalaryAdvances),
  createSalaryAdvance: wrap('api', 'createSalaryAdvance', api.createSalaryAdvance),
  updateSalaryAdvance: wrap('api', 'updateSalaryAdvance', api.updateSalaryAdvance),
  getOverheads: wrap('api', 'getOverheads', api.getOverheads),
  updateEmployee: wrap('api', 'updateEmployee', api.updateEmployee),
  deleteEmployee: wrap('api', 'deleteEmployee', api.deleteEmployee),
  // Attendance
  getTimesheets: wrap('api', 'getTimesheets', api.getTimesheets),
  saveTimesheet: wrap('api', 'saveTimesheet', api.saveTimesheet),
  saveTimesheetBulk: wrap('api', 'saveTimesheetBulk', api.saveTimesheetBulk),
  approveTimesheet: wrap('api', 'approveTimesheet', api.approveTimesheet),
  rejectTimesheet: wrap('api', 'rejectTimesheet', api.rejectTimesheet),
  getLeaves: wrap('api', 'getLeaves', api.getLeaves),
  getAllLeaves: wrap('api', 'getAllLeaves', api.getAllLeaves),
  getTeamLeaveCalendar: wrap('api', 'getTeamLeaveCalendar', api.getTeamLeaveCalendar),
  getLeaveBalance: wrap('api', 'getLeaveBalance', api.getLeaveBalance),
  applyLeaveBulk: wrap('api', 'applyLeaveBulk', api.applyLeaveBulk),
  deleteLeave: wrap('api', 'deleteLeave', api.deleteLeave),
  approveLeave: wrap('api', 'approveLeave', api.approveLeave),
  rejectLeave: wrap('api', 'rejectLeave', api.rejectLeave),
};

export const teamKpiApi = {
  getMyKpis: wrap('kpi', 'getMyKpis', kpi.getMyKpis),
  getTeamKpis: wrap('kpi', 'getTeamKpis', kpi.getTeamKpis),
  saveKpiConfig: wrap('kpi', 'saveKpiConfig', kpi.saveKpiConfig),
  saveKpiSettings: wrap('kpi', 'saveKpiSettings', kpi.saveKpiSettings),
  askKpiReview: wrap('kpi', 'askKpiReview', kpi.askKpiReview),
  approveVariablePay: wrap('kpi', 'approveVariablePay', kpi.approveVariablePay),
  withdrawVariablePay: wrap('kpi', 'withdrawVariablePay', kpi.withdrawVariablePay),
};

export const teamWorkplaceApi = {
  getAccess: wrap('workplace', 'getAccess', wp.getAccess),
  getMyChecks: wrap('workplace', 'getMyChecks', wp.getMyChecks),
  uploadPhoto: wrap('workplace', 'uploadPhoto', wp.uploadPhoto),
  rescorePhoto: wrap('workplace', 'rescorePhoto', wp.rescorePhoto),
  getReview: wrap('workplace', 'getReview', wp.getReview),
  getSummary: wrap('workplace', 'getSummary', wp.getSummary),
  setFlag: wrap('workplace', 'setFlag', wp.setFlag),
  loadPhotoUrl: wrap('workplace', 'loadPhotoUrl', wp.loadPhotoUrl),
};

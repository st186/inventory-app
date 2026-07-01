# Changelog

## 2026-07-01 — Push notifications overhaul + type-safety pass

### Push Notifications
- Fixed push notifications so they actually work in production — the backend was signing messages with a fake signature that real push services (Chrome/FCM) would always reject.
- Added a working "Enable Push Notifications" button (bottom-right bell icon), fixing a bug where clicking it never asked for browser permission.
- Push notifications now fire for every event that already had an in-app bell notification, not just the two that had it before:
  - Inventory / sales data logged
  - Cash discrepancy requests, approvals, rejections
  - Production data submitted / approved
  - Timesheet submitted / approved / rejected
  - Leave applied / approved / rejected
  - New production requests and status changes (accepted → delivered)
  - New stock requests, delayed request alerts, stock recalibrations
  - 3PM stock request reminders

### Bug Fixes
- Monthly stock recalibration was always showing "Total Received" as 0 for stores due to a field-name mismatch — now calculates correctly.
- Converting cash to online balance crashed with an error every time, even on success — fixed.
- The "Create Employee" button always failed — it was calling a function that didn't exist.
- Salary advances created by managers/payroll never got their 4-month deduction schedule set up, so automatic payroll deduction silently never happened — fixed.
- Approval/rejection dates on sales records were showing blank — fixed.
- Fixed a case where a form's submit button could get permanently stuck if the save action ever completed synchronously.

### Infrastructure
- Fixed the production build not actually including the service worker or Netlify config (they lived in a folder that wasn't part of the real build).
- Moved the backend function to the location the Supabase CLI expects, so it can actually be deployed from this repo going forward.
- Removed a duplicate, unused copy of the entire project structure that had been living inside `src/`.
- Added TypeScript type-checking (`npm run type-check`) to the project so this class of bug gets caught automatically before it ships next time.

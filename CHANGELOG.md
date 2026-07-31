# Changelog

## 2026-07-01 (2) — Reliable reminders, shipment fulfillment tracking, notification deep-linking

### Reminders now run server-side
- Moved all scheduled reminders off the old "only works if a browser tab happens to be open" approach onto real server-side cron jobs (`pg_cron`), so they fire reliably every day regardless of whether anyone has the app open:
  - **1:00 PM** — Production Heads reminded about pending stock/production requests still awaiting fulfillment
  - **3:00 PM** — Store Incharges reminded if they haven't submitted a stock request
  - **8:00 PM** — Operations Managers reminded if they haven't logged inventory/sales data
  - **11:59 AM** — Employees/managers reminded about missing timesheet entries (checks the trailing 5 days)

### Shipment fulfillment tracking
- Added Coke as a trackable Kitchen Utility item (unit: cartons).
- Production Heads can now mark individual sauces as included/missing when confirming a shipment, not just momo/utility quantities.
- Added a "Fulfillment Details" section to each request card showing requested vs. actually-shipped quantities per item, with shortfalls highlighted in red — shows up automatically once a request is shipped.
- Fixed a real bug where the shipping dialog and the backend's "fully vs. partially shipped" calculation used a hardcoded, outdated list of momo names instead of your actual configured menu items — meaning the Momos section could silently be missing from the shipping dialog, and momo shortfalls weren't being detected at all.

### Notification click-through
- Clicking any push notification now takes you directly to the relevant page (and the relevant sub-tab for Attendance-related ones), instead of just opening the app to wherever it happened to be.
- Clicking a "shipped"/"partially shipped" notification now scrolls straight to the Fulfillment Details section (with a highlight ring), instead of just the top of the request.
- Fixed the root cause of push notifications not being delivered at all: the `VAPID_SUBJECT` secret was set to a bare email address instead of the required `mailto:` format, which caused every single push send to fail silently since the real signing library was introduced.

### Other fixes
- Timesheet days with no entry now show "Unknown" status instead of being ambiguous with "Pending."
- Status-change buttons (Accept, Start Preparation, Mark as Prepared, Confirm Delivery) now show a spinner and disable themselves while the update is processing, so it's clear the click registered.
- Fixed the whole page collapsing and losing your scroll position every time you accepted/prepared/shipped a request — the loading spinner now only shows on the very first load, not on every refresh.

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

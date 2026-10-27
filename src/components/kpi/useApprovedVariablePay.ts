import { useEffect, useState } from 'react';
import { getApprovedVariablePay } from './kpiApi';

// Payroll hook: when exactly one person is picked on the payout form, look up the variable pay
// the owner approved in Team KPIs for the "salary for month" and hand it to `onPrefill` (which
// should only fill an empty field). Returns the approved amount (or null) for a hint line.
export function useApprovedVariablePay(open: boolean, employeeIds: string[], month: string, onPrefill: (amount: number) => void) {
  const [approved, setApproved] = useState<number | null>(null);
  const single = open && employeeIds.length === 1 ? employeeIds[0] : null;
  useEffect(() => {
    setApproved(null);
    if (!single || !/^\d{4}-\d{2}$/.test(month || '')) return;
    let cancelled = false;
    getApprovedVariablePay(month, single)
      .then((r) => {
        if (cancelled || r.approved === null) return;
        setApproved(r.approved);
        onPrefill(r.approved);
      })
      .catch(() => { /* not allowed or older server: type it by hand as before */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, month]);
  return approved;
}

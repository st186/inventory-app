// Shared payslip generator - used by both EmployeeDashboard.tsx (plain employees'
// own "My Payouts" view) and PayrollManagement.tsx (manager/incharge "My Payouts"
// view). Previously each component had its own copy of this function, which is how
// a redesign landed in one but not the other - fixing that duplication here.

export interface PayslipPayout {
  date: string;
  // What was actually transferred - already net of any salary-advance instalment
  // recovered from this payout (advanceDeduction).
  amount: number;
  forMonth?: string;
  // Bank/UPI reference for this specific payment - shown as a note under the earnings
  // table, kept as a paper trail the employee can point to.
  transactionId?: string;
  // This month's variable/incentive pay - broken out as its own line when a
  // salaryStructure is supplied, alongside the employee's fixed components.
  variablePay?: number;
  variablePayLabel?: string; // defaults to "Variable Pay" if omitted
  // Salary-advance instalment(s) recovered from this payout (amount is after this).
  advanceDeduction?: number;
}

export interface PayslipSalaryComponent {
  label: string;
  amount: number;
}

// Which month a payout is listed under (payslips, My Payouts): the month it is for when
// set, otherwise the month it was paid.
export function payoutMonth(p: { forMonth?: string; date: string }): string {
  return p.forMonth || (p.date || '').slice(0, 7);
}

// Salaries go out in the first days of the next month. A payment on or before this day of
// the month is taken to be last month's salary - the Add Payout form's default "Salary For
// Month" on the Permanent tab, and the month an older payout without forMonth recovers a
// salary-advance instalment for.
export const SALARY_PAID_BY_DAY = 10;

export function defaultSalaryMonth(paymentDate: string): string {
  const [y, m, d] = (paymentDate || '').split('-').map(Number);
  if (!y || !m || !d || d > SALARY_PAID_BY_DAY) return (paymentDate || '').slice(0, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// The month a payout's salary is for - what a salary-advance instalment is matched to.
export function salaryMonthOf(p: { forMonth?: string; date: string }): string {
  return p.forMonth || defaultSalaryMonth(p.date);
}

// The monthly salary an advance is capped at: the record's monthlySalary if one was ever
// set, otherwise the fixed salary structure (Basic + HRA + ...), which is what the forms write.
export function monthlySalaryOf(employee: { monthlySalary?: number; salaryStructure?: PayslipSalaryComponent[] } | null | undefined): number {
  if (!employee) return 0;
  if (employee.monthlySalary && employee.monthlySalary > 0) return employee.monthlySalary;
  return (employee.salaryStructure || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

// Every personal expense (advance cash already handed over, booked as an expense) mapped to
// this person and month: by expenseMonth when set, else by the expense date's month.
export function personalExpensesForMonth(
  overheads: { category?: string; employeeId?: string; expenseMonth?: string; date?: string; amount: number }[],
  employeeId: string,
  month: string
): number {
  return overheads
    .filter(o => o.category === 'personal_expense' && o.employeeId === employeeId &&
      (o.expenseMonth ? o.expenseMonth === month : (o.date || '').slice(0, 7) === month))
    .reduce((sum, o) => sum + (o.amount || 0), 0);
}

// One month's pay, worked out the same way for the payslip, the employee's own dashboard
// and Payroll's My Payouts (they used to disagree: one ignored personal expenses).
// gross = what was earned (transfers + advance instalments recovered from them);
// net = transfers - personal expenses, as Payroll has always shown it (this assumes the
// transfer amount did not already have the personal expenses taken off).
export function computeMonthlyPay(payouts: PayslipPayout[], personalExpenses: number = 0) {
  const paid = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);
  const advanceRecovered = payouts.reduce((sum, p) => sum + (p.advanceDeduction || 0), 0);
  const variablePay = payouts.reduce((sum, p) => sum + (p.variablePay || 0), 0);
  return {
    gross: paid + advanceRecovered,
    variablePay,
    advanceRecovered,
    personalExpenses,
    paid,
    net: paid - personalExpenses,
  };
}

// Standard Basic/HRA/Special-Allowance split, used only as a placeholder when the
// employee has no salaryStructure configured yet in Employee Management - so the
// payslip always shows a real component breakdown instead of one flat "Salary Payment"
// line, without inventing numbers that don't foot to what was actually paid. Special
// Allowance absorbs the rounding remainder so the three lines always sum exactly to
// baseAmount.
function getPlaceholderSalaryComponents(baseAmount: number): PayslipSalaryComponent[] {
  const basic = Math.round(baseAmount * 0.5);
  const hra = Math.round(baseAmount * 0.2);
  const special = baseAmount - basic - hra;
  return [
    { label: 'Basic Pay', amount: basic },
    { label: 'House Rent Allowance (HRA)', amount: hra },
    { label: 'Special Allowance', amount: special },
  ];
}

export function generatePayslip(
  employeeName: string,
  employeeId: string,
  month: string,
  year: string,
  payouts: PayslipPayout[],
  employeeType: string,
  personalExpenses: number = 0,
  // Fixed monthly components (Basic, HRA, etc.) from the employee's record - when
  // present, the month's earnings are itemized against these (once for the month, not
  // once per payout) plus the variable pay, with any leftover shown as one "Other
  // Adjustment" so the breakdown always foots to what was earned. Without them a
  // placeholder Basic/HRA/Special split is used.
  salaryStructure?: PayslipSalaryComponent[]
) {
  // Same numbers every screen shows for this month (see computeMonthlyPay).
  const pay = computeMonthlyPay(payouts, personalExpenses);
  const totalAmount = pay.net;
  const transactionIds = payouts.map(p => p.transactionId).filter((id): id is string => !!id);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const rupees = (n: number) => `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
  // True whenever this payslip had to fall back to the placeholder Basic/HRA/Special
  // split below for at least one row - drives the disclosure note under the table.
  const usedPlaceholderStructure = employeeType === 'fulltime' && (!salaryStructure || salaryStructure.length === 0);
  const logoUrl = `${window.location.origin}/bunny-logo.png`;

  const payslipContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payslip - ${month} ${year}</title>
      <style>
        @page {
          size: A4;
          margin: 16mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: Georgia, 'Times New Roman', serif;
          margin: 0;
          padding: 0;
          color: #1c1917;
          font-size: 13px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .payslip {
          max-width: 720px;
          margin: 0 auto;
        }
        .letterhead {
          text-align: center;
          padding-bottom: 14px;
          margin-bottom: 18px;
          border-bottom: 3px solid transparent;
          border-image: linear-gradient(90deg, #ea580c, #f59e0b) 1;
        }
        .letterhead-logo {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          margin-bottom: 6px;
        }
        .company-name {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #1c1917;
        }
        .company-tagline {
          font-size: 12px;
          color: #57534e;
          font-style: italic;
          margin-top: 2px;
        }
        .placeholder-note {
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
          font-size: 10px;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 6px 10px;
          margin: 8px 0 0;
        }
        .doc-title {
          text-align: center;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #ea580c;
          margin-bottom: 2px;
        }
        .doc-period {
          text-align: center;
          font-size: 12px;
          color: #57534e;
          margin-bottom: 18px;
        }
        .info-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 18px;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        }
        .info-table td {
          padding: 6px 10px;
          border: 1px solid #d6d3d1;
          font-size: 12px;
        }
        .info-table .label-cell {
          background: #faf5f0;
          font-weight: 600;
          color: #57534e;
          width: 30%;
        }
        .earnings-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 4px;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        }
        .earnings-table th {
          background: linear-gradient(90deg, #1c1917, #292524);
          color: #fff;
          padding: 8px 12px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .earnings-table td {
          padding: 8px 12px;
          border-bottom: 1px solid #e7e5e4;
          font-size: 12.5px;
        }
        .earnings-table tr:last-child td {
          border-bottom: none;
        }
        .amount-col {
          text-align: right;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .deduction-row td {
          color: #b91c1c;
        }
        .net-pay-bar {
          border-radius: 10px;
          background: linear-gradient(90deg, #ea580c, #f59e0b);
          color: #fff;
          padding: 14px 18px;
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
          box-shadow: 0 4px 10px rgba(234, 88, 12, 0.25);
        }
        .net-pay-label {
          font-size: 13px;
          font-weight: 600;
        }
        .net-pay-amount {
          font-size: 20px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .signature-section {
          margin-top: 44px;
          display: flex;
          justify-content: space-between;
          gap: 40px;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        }
        .signature-box {
          text-align: center;
          flex: 1;
          font-size: 11px;
        }
        .signature-line {
          border-top: 1px solid #78716c;
          margin-top: 34px;
          padding-top: 6px;
          font-weight: 600;
          color: #44403c;
        }
        .footer {
          margin-top: 22px;
          padding-top: 10px;
          border-top: 1px solid #d6d3d1;
          text-align: center;
          font-size: 10px;
          color: #a8a29e;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        }
        .footer p {
          margin: 2px 0;
        }
      </style>
    </head>
    <body>
      <div class="payslip">
        <div class="letterhead">
          <img class="letterhead-logo" src="${logoUrl}" alt="Bunny Momos" />
          <div class="company-name">Bunny Momos</div>
          <div class="company-tagline">Payroll Department &middot; Generated via Bhandar</div>
        </div>
        <div class="doc-title">Salary Slip</div>
        <div class="doc-period">For the Month of ${month} ${year}</div>

        <table class="info-table">
          <tr>
            <td class="label-cell">Employee Name</td>
            <td>${employeeName}</td>
            <td class="label-cell">Employee ID</td>
            <td>${employeeId}</td>
          </tr>
          <tr>
            <td class="label-cell">Employee Type</td>
            <td>${employeeType === 'fulltime' ? 'Permanent' : 'Contract'}</td>
            <td class="label-cell">Payslip Period</td>
            <td>${month} ${year}</td>
          </tr>
        </table>

        <table class="earnings-table">
          <thead>
            <tr>
              <th>Earnings &amp; Deductions</th>
              <th class="amount-col">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              if (employeeType !== 'fulltime') {
                return payouts.map(payout => `
                  <tr>
                    <td>Daily Wage Payment &middot; ${formatDate(payout.date)}</td>
                    <td class="amount-col">${rupees(payout.amount + (payout.advanceDeduction || 0))}</td>
                  </tr>
                `).join('');
              }
              // The month's salary is itemized once. It used to repeat the full structure
              // for every payout in the month and balance the extra copies with a negative
              // "Other Adjustment".
              const structure = salaryStructure && salaryStructure.length > 0
                ? salaryStructure
                : getPlaceholderSalaryComponents(pay.gross - pay.variablePay);
              const fixedRows = structure.map(comp => `
                <tr>
                  <td>${comp.label}</td>
                  <td class="amount-col">${rupees(comp.amount)}</td>
                </tr>
              `).join('');
              const fixedTotal = structure.reduce((s, c) => s + (c.amount || 0), 0);
              const variableLabel = payouts.find(p => p.variablePay)?.variablePayLabel || 'Variable Pay';
              const variableRow = pay.variablePay > 0 ? `
                <tr>
                  <td>${variableLabel}</td>
                  <td class="amount-col">${rupees(pay.variablePay)}</td>
                </tr>
              ` : '';
              // Whatever's left after the itemized components - keeps the breakdown
              // honest when the month's pay doesn't match the structure exactly (unpaid
              // days, a raise not yet reflected in salaryStructure, a one-off bonus, etc.).
              const remainder = pay.gross - fixedTotal - pay.variablePay;
              const adjustmentRow = Math.abs(remainder) >= 1 ? `
                <tr>
                  <td>Other Adjustment</td>
                  <td class="amount-col">${rupees(remainder)}</td>
                </tr>
              ` : '';
              return fixedRows + variableRow + adjustmentRow;
            })()}
            <tr>
              <td><strong>Gross Earnings</strong></td>
              <td class="amount-col"><strong>${rupees(pay.gross)}</strong></td>
            </tr>
            ${pay.advanceRecovered > 0 ? `
              <tr class="deduction-row">
                <td>Salary Advance Recovery</td>
                <td class="amount-col">${rupees(-pay.advanceRecovered)}</td>
              </tr>
            ` : ''}
            ${personalExpenses > 0 ? `
              <tr class="deduction-row">
                <td>Advance / Personal Expense Deduction</td>
                <td class="amount-col">${rupees(-personalExpenses)}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        <p style="font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 10.5px; color: #78716c; margin: 4px 2px 0;">
          Paid: ${payouts.map(p => `${formatDate(p.date)} ${rupees(p.amount)}`).join(', ')}
          ${transactionIds.length > 0 ? `<br />Transaction ID${transactionIds.length > 1 ? 's' : ''}: ${transactionIds.join(', ')}` : ''}
        </p>
        ${usedPlaceholderStructure ? `
          <p class="placeholder-note">
            ⚠ Basic Pay / HRA / Special Allowance above are an indicative split, not this employee's configured salary structure.
            Set the real components in Employee Management for an accurate breakdown on future payslips.
          </p>
        ` : ''}

        <div class="net-pay-bar">
          <span class="net-pay-label">Net ${employeeType === 'fulltime' ? 'Salary' : 'Payment'} for ${month} ${year}</span>
          <span class="net-pay-amount">₹${totalAmount.toLocaleString('en-IN')}</span>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line">Employee Signature</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Authorized Signatory</div>
          </div>
        </div>

        <div class="footer">
          <p>This is a computer-generated payslip and does not require a signature.</p>
          <p>© ${year} Bunny Momos. All rights reserved. Generated via Bhandar.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(payslipContent);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
    };
  }
}

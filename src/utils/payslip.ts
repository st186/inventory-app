// Shared payslip generator - used by both EmployeeDashboard.tsx (plain employees'
// own "My Payouts" view) and PayrollManagement.tsx (manager/incharge "My Payouts"
// view). Previously each component had its own copy of this function, which is how
// a redesign landed in one but not the other - fixing that duplication here.

export interface PayslipPayout {
  date: string;
  amount: number;
  // Bank/UPI reference for this specific payment - shown as a note under the earnings
  // table, kept as a paper trail the employee can point to.
  transactionId?: string;
  // This month's variable/incentive pay - broken out as its own line when a
  // salaryStructure is supplied, alongside the employee's fixed components.
  variablePay?: number;
  variablePayLabel?: string; // defaults to "Variable Pay" if omitted
}

export interface PayslipSalaryComponent {
  label: string;
  amount: number;
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
  // present, each payout's lump amount is itemized against these plus its own
  // variablePay, with any leftover shown as "Other Adjustment" so the breakdown always
  // foots to the actual amount paid. Omitted entirely -> falls back to one flat
  // "Salary Payment" line per payout, same as before this breakdown existed.
  salaryStructure?: PayslipSalaryComponent[]
) {
  const regularPayouts = payouts.reduce((sum, p) => sum + p.amount, 0);
  // personalExpenses are salary-advance cash already given to the employee - deducted from this month's net pay
  const totalAmount = regularPayouts - personalExpenses;
  const transactionIds = payouts.map(p => p.transactionId).filter((id): id is string => !!id);
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
              <th>Payment Date</th>
              <th>Description</th>
              <th class="amount-col">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${payouts.map(payout => {
              const formattedDate = new Date(payout.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

              if (employeeType === 'fulltime') {
                // A configured salaryStructure applies to the whole payout amount as-is;
                // without one, split just the base (amount minus this payout's own
                // variablePay) into placeholder components so "Variable Pay" below isn't
                // double-counted inside the placeholder split too.
                const structure = salaryStructure && salaryStructure.length > 0
                  ? salaryStructure
                  : getPlaceholderSalaryComponents(payout.amount - (payout.variablePay || 0));
                const fixedRows = structure.map(comp => `
                  <tr>
                    <td>${formattedDate}</td>
                    <td>${comp.label}</td>
                    <td class="amount-col">₹${comp.amount.toLocaleString('en-IN')}</td>
                  </tr>
                `).join('');
                const fixedTotal = structure.reduce((s, c) => s + (c.amount || 0), 0);
                const variableAmount = payout.variablePay || 0;
                const variableRow = variableAmount > 0 ? `
                  <tr>
                    <td>${formattedDate}</td>
                    <td>${payout.variablePayLabel || 'Variable Pay'}</td>
                    <td class="amount-col">₹${variableAmount.toLocaleString('en-IN')}</td>
                  </tr>
                ` : '';
                // Whatever's left after the itemized components - keeps the breakdown
                // honest when the amount actually paid doesn't match the structure exactly
                // (a raise not yet reflected in salaryStructure, a one-off bonus, etc.).
                const remainder = payout.amount - fixedTotal - variableAmount;
                const adjustmentRow = Math.abs(remainder) >= 1 ? `
                  <tr>
                    <td>${formattedDate}</td>
                    <td>Other Adjustment</td>
                    <td class="amount-col">${remainder < 0 ? '−' : ''}₹${Math.abs(remainder).toLocaleString('en-IN')}</td>
                  </tr>
                ` : '';
                return fixedRows + variableRow + adjustmentRow;
              }

              return `
                <tr>
                  <td>${formattedDate}</td>
                  <td>${employeeType === 'fulltime' ? 'Salary Payment' : 'Daily Wage Payment'}</td>
                  <td class="amount-col">₹${payout.amount.toLocaleString('en-IN')}</td>
                </tr>
              `;
            }).join('')}
            ${personalExpenses > 0 ? `
              <tr class="deduction-row">
                <td>Various</td>
                <td>Advance / Personal Expense Deduction</td>
                <td class="amount-col">−₹${personalExpenses.toLocaleString('en-IN')}</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        ${transactionIds.length > 0 ? `
          <p style="font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 10.5px; color: #78716c; margin: 4px 2px 0;">
            Transaction ID${transactionIds.length > 1 ? 's' : ''}: ${transactionIds.join(', ')}
          </p>
        ` : ''}
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

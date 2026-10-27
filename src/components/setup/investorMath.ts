// Per-investor loan figures for the Investments tab (moved out of InvestmentsManagement.tsx
// unchanged, so the screen and the number check share one copy).
import type * as api from '../../utils/api';

export function investorAnalytics(loans: api.OnlineLoan[], investorId: string) {
  const investorLoans = loans.filter((loan) => loan.investorId === investorId);
  const totalLent = investorLoans.reduce((sum, loan) => sum + loan.loanAmount, 0);
  const totalRepaid = investorLoans.reduce((sum, loan) => sum + loan.repaidAmount, 0);
  const totalInterest = investorLoans.reduce((sum, loan) => {
    const interest = (loan.interestRate || 0) / 100 * loan.loanAmount;
    return sum + interest;
  }, 0);
  const activeLoans = investorLoans.filter((loan) => loan.status === 'active').length;
  const outstanding = totalLent + totalInterest - totalRepaid;

  return {
    totalLent,
    totalRepaid,
    totalInterest,
    activeLoans,
    outstanding,
    investorLoans,
  };
}

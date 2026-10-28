import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { Textarea } from './ui/textarea';
import { FigureCard, FigureRow } from './money/MoneyLayout';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  loan: api.OnlineLoan;
  selectedDate?: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function RepayLoanModal({ 
  context,
  loan,
  selectedDate,
  onClose,
  onSaveSuccess
}: Props) {
  const remainingAmount = loan.loanAmount - loan.repaidAmount;
  
  const [repaymentAmount, setRepaymentAmount] = useState<string>('0');
  const [repaymentDate, setRepaymentDate] = useState(selectedDate || getTodayIST());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Calculate interest accrued based on repayment date (not today)
  const calculateInterest = (toDate: string) => {
    if (!loan.interestRate || loan.interestRate === 0) return 0;
    
    const loanDate = new Date(loan.loanDate);
    const targetDate = new Date(toDate);
    const daysDiff = Math.floor((targetDate.getTime() - loanDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Monthly interest: (Principal × Rate × Time in days) / (100 × 30)
    // Time in months = days / 30
    const interest = (loan.loanAmount * loan.interestRate * daysDiff) / (100 * 30);
    return Math.max(0, interest);
  };
  
  const interestAccrued = calculateInterest(repaymentDate);
  const totalAmountWithInterest = remainingAmount + interestAccrued;
  
  // Update repayment amount when interest changes
  useEffect(() => {
    setRepaymentAmount(totalAmountWithInterest.toFixed(2));
  }, [interestAccrued]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken) {
      setError('Missing authentication');
      return;
    }

    const repaymentAmountNum = parseFloat(repaymentAmount);
    if (isNaN(repaymentAmountNum) || repaymentAmountNum <= 0) {
      setError('Please enter a valid repayment amount');
      return;
    }

    if (repaymentAmountNum > totalAmountWithInterest) {
      setError(`Repayment amount cannot exceed total amount with interest (₹${totalAmountWithInterest.toLocaleString()})`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.repayOnlineLoan(
        context.user.accessToken,
        loan.id,
        {
          repaymentAmount: repaymentAmountNum,
          repaymentDate,
          notes,
        }
      );

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error repaying loan:', err);
      setError(err.message || 'Failed to process loan repayment');
    } finally {
      setSaving(false);
    }
  };

  const isFullRepayment = parseFloat(repaymentAmount) === totalAmountWithInterest;

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Repay loan"
      description={loan.storeName}
      dirty={repaymentAmount !== '0' && !saving && !success}
      footer={
        <Button type="submit" form="repay-loan-form" size="lg" fullWidth leadingIcon={<Save />} loading={saving} disabled={!repaymentAmount}>
          {isFullRepayment ? 'Pay full amount' : 'Make payment'}
        </Button>
      }
    >
      <form id="repay-loan-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {success && <Callout tone="success" title="Repayment saved">The amount is taken off the Paytm balance.</Callout>}
        {error && <Callout tone="danger" title={error} />}

        <FigureCard>
          <FigureRow label="Original loan" value={formatINR(loan.loanAmount)} />
          {loan.interestRate && loan.interestRate > 0 ? <FigureRow label="Interest rate" value={`${loan.interestRate}% a month`} /> : null}
          <FigureRow label="Already repaid" value={formatINR(loan.repaidAmount)} />
          <FigureRow label="Principal left" value={formatINR(remainingAmount)} emphasis />
          {loan.interestRate && loan.interestRate > 0 ? (
            <>
              <FigureRow label="Interest till the repayment date" caption={interestAccrued === 0 ? 'Change the repayment date to see the interest' : undefined} value={formatINR(interestAccrued, { decimals: 2 })} />
              {interestAccrued > 0 && <FigureRow label="Total with interest" value={formatINR(totalAmountWithInterest, { decimals: 2 })} emphasis />}
            </>
          ) : null}
          <FigureRow label="Loan date" value={new Date(loan.loanDate).toLocaleDateString('en-IN')} />
        </FigureCard>

        <Field label="Repayment amount" required helper={isFullRepayment ? 'Full repayment' : 'Part repayment'}>
          <MoneyInput value={repaymentAmount} onValueChange={(_, raw) => setRepaymentAmount(raw)} required />
        </Field>
        <Button variant="link" size="sm" className="-mt-2 self-start" onClick={() => setRepaymentAmount(totalAmountWithInterest.toString())}>Pay the full amount</Button>

        <Field label="Repayment date" required>
          <Input type="date" value={repaymentDate} onChange={(e) => setRepaymentDate(e.target.value)} required />
        </Field>

        <Field label="Notes" optional>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything to note about this repayment" />
        </Field>

        <Callout tone="warning" title="Taken off the Paytm balance">Make sure Paytm has enough for this repayment.</Callout>
      </form>
    </ResponsiveModal>
  );
}

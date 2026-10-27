import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { MoneyInput } from './ui/money';
import { PickerField } from './ui/picker-sheet';
import { ResponsiveModal } from './ui/responsive-modal';
import { Textarea } from './ui/textarea';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { getTodayIST } from '../utils/timezone';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string;
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function ApplyLoanModal({ 
  context,
  selectedStoreId,
  selectedDate,
  onClose,
  onSaveSuccess
}: Props) {
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loanDate, setLoanDate] = useState(selectedDate || getTodayIST());
  const [notes, setNotes] = useState('');
  const [investorId, setInvestorId] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [investors, setInvestors] = useState<api.Investor[]>([]);
  const [loadingInvestors, setLoadingInvestors] = useState(true);
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  const storeName = store?.name || 'Unknown Store';

  useEffect(() => {
    loadInvestors();
  }, [context.user]);

  const loadInvestors = async () => {
    if (!context.user?.accessToken) return;
    try {
      setLoadingInvestors(true);
      const data = await api.getInvestors(context.user.accessToken);
      setInvestors(data);
    } catch (error) {
      console.error('Error loading investors:', error);
    } finally {
      setLoadingInvestors(false);
    }
  };

  // Check for missing store info on mount
  if (!effectiveStoreId || !store) {
    return (
      <ResponsiveModal
        open
        onOpenChange={(open) => { if (!open) onClose(); }}
        title="Pick a store first"
        footer={<Button variant="secondary" size="lg" fullWidth onClick={onClose}>Close</Button>}
      >
        <Callout tone="warning" title="No store selected">Pick a store with the store chip at the top before asking for a loan.</Callout>
      </ResponsiveModal>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken || !effectiveStoreId) {
      setError('Missing authentication or store information');
      return;
    }

    const loanAmountNum = parseFloat(loanAmount);
    if (isNaN(loanAmountNum) || loanAmountNum <= 0) {
      setError('Please enter a valid loan amount');
      return;
    }
    if (loanAmountNum <= 5000) {
      setError('Loans must be for more than ₹5,000 - this is meant for heavy expenses, not routine top-ups');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const loanData = {
        storeId: effectiveStoreId,
        storeName,
        loanAmount: loanAmountNum,
        loanDate,
        notes,
        createdBy: context.user.email,
        investorId,
        interestRate: parseFloat(interestRate) || 0,
      };

      await api.applyOnlineLoan(context.user.accessToken, loanData);

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error applying for loan:', err);
      setError(err.message || 'Failed to apply for loan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Request a loan"
      description={storeName}
      dirty={!!loanAmount && !saving && !success}
      footer={<Button type="submit" form="apply-loan-form" size="lg" fullWidth leadingIcon={<Save />} loading={saving} disabled={!loanAmount}>Apply for loan</Button>}
    >
      <form id="apply-loan-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {success && <Callout tone="success" title="Loan request sent">A cluster head reviews it. Once approved it is added to the Paytm balance.</Callout>}
        {error && <Callout tone="danger" title={error} />}

        <Field label="Loan amount" required helper="More than ₹5,000. Once a cluster head approves it, it is added to the Paytm balance.">
          <MoneyInput value={loanAmount} onValueChange={(_, raw) => setLoanAmount(raw)} required />
        </Field>

        <Field label="Loan date" required>
          <Input type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} required />
        </Field>

        <Field label="Purpose" optional>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Purpose, source, repayment terms" />
        </Field>

        <Field label="Investor" required helper={loadingInvestors ? 'Loading investors' : undefined}>
          <PickerField
            title="Investor"
            items={investors.map((investor) => ({ value: investor.id, label: investor.name }))}
            value={investorId || null}
            onValueChange={setInvestorId}
            placeholder="Select investor"
            disabled={loadingInvestors}
          />
        </Field>

        <Field label="Interest rate (%)" required>
          <Input type="number" inputMode="decimal" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="Enter interest rate" required className="num" />
        </Field>

        <Callout tone="info" title="How loans work">
          <span className="flex flex-col gap-0.5">
            <span>Only requests over ₹5,000, for heavy expenses.</span>
            <span>A cluster head approves the request first.</span>
            <span>Once approved, the amount is added to the Paytm balance.</span>
            <span>Repay loan pays it back (taken off the Paytm balance); part payments are fine.</span>
          </span>
        </Callout>
      </form>
    </ResponsiveModal>
  );
}

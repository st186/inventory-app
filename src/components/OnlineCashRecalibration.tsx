import { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirm } from './ui/confirm';
import { Button } from './ui/button';
import { Callout } from './ui/callout';
import { Field } from './ui/field';
import { Input } from './ui/input';
import { Money, MoneyInput, formatINR } from './ui/money';
import { ResponsiveModal } from './ui/responsive-modal';
import { SegmentedControl } from './ui/segmented-control';
import { SkeletonListRows } from './ui/skeleton';
import { StatTile } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Textarea } from './ui/textarea';
import * as api from '../utils/api';
import { formatDateTimeIST, getTodayIST } from '../utils/timezone';
import { InventoryContextType } from '../App';

type Props = {
  context: InventoryContextType;
  selectedStoreId?: string | null;
  selectedDate?: string; // Add selectedDate prop
  systemBalance: number; // Pre-calculated balance from SalesManagement
  onClose: () => void;
  onSaveSuccess?: () => void;
};

export function OnlineCashRecalibration({ 
  context,
  selectedStoreId,
  selectedDate, // Add selectedDate to destructuring
  systemBalance,
  onClose,
  onSaveSuccess
}: Props) {
  const [actualBalance, setActualBalance] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [discrepancyType, setDiscrepancyType] = useState<'none' | 'mistake' | 'loan'>('none');
  const [loanAmount, setLoanAmount] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastRecalibration, setLastRecalibration] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [manualDate, setManualDate] = useState<string>(''); // Add state for manual date selection
  
  const effectiveStoreId = selectedStoreId || context.user?.storeId;
  const store = context.stores?.find(s => s.id === effectiveStoreId);
  const storeName = store?.name || 'Unknown Store';
  
  const today = getTodayIST();
  // Use manualDate if set, otherwise use selectedDate or today
  const recalibrationDate = manualDate || selectedDate || today;
  const targetDate = selectedDate || today;

  useEffect(() => {
    checkLastRecalibration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  async function checkLastRecalibration() {
    try {
      setLoading(true);
      if (!effectiveStoreId || !context.user?.accessToken) return;

      // One recalibration per store PER DATE - look up the exact date being
      // reconciled (e.g. this Sunday) so re-opening it shows the existing entry
      // for edit, without clobbering other weeks' entries in the same month.
      const response = await api.getOnlineCashRecalibrationHistory(
        context.user.accessToken,
        effectiveStoreId
      );

      const recalibration = (response?.history || []).find((r: any) => r.date === targetDate) || null;

      if (recalibration) {
        setLastRecalibration(recalibration);
        setActualBalance(recalibration.actualBalance.toString());
        setNotes(recalibration.notes || '');
        setDiscrepancyType(recalibration.discrepancyType || 'none');
        setLoanAmount(recalibration.loanAmount?.toString() || '');
        setManualDate(recalibration.date || ''); // Load the recalibration date
      } else {
        setLastRecalibration(null);
        setActualBalance('');
        setNotes('');
        setDiscrepancyType('none');
        setLoanAmount('');
        setManualDate(targetDate);
      }
    } catch (err) {
      console.error('Error fetching last recalibration:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!context.user?.accessToken || !effectiveStoreId) {
      setError('Missing authentication or store information');
      return;
    }

    const actualBalanceNum = parseFloat(actualBalance);
    if (isNaN(actualBalanceNum)) {
      setError('Please enter a valid actual balance');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const recalibrationData = {
        storeId: effectiveStoreId,
        storeName,
        month: recalibrationDate.substring(0, 7),
        date: recalibrationDate,
        systemBalance: systemBalance,
        actualBalance: actualBalanceNum,
        difference: actualBalanceNum - systemBalance,
        notes: notes,
        createdBy: context.user.email,
        approvalStatus: 'approved' as const, // Auto-approved for now
        discrepancyType: discrepancyType,
        loanAmount: discrepancyType === 'loan' ? parseFloat(loanAmount) : null,
      };

      console.log('💾 ===== SUBMITTING RECALIBRATION =====');
      console.log('📊 Recalibration data being saved:', recalibrationData);
      console.log('🏪 Store ID:', effectiveStoreId);
      console.log('📅 Month:', recalibrationData.month);
      console.log('📅 Date:', recalibrationDate);
      console.log('💰 System Balance:', systemBalance);
      console.log('💰 Actual Balance:', actualBalanceNum);
      console.log('💰 Difference:', actualBalanceNum - systemBalance);

      await api.submitOnlineCashRecalibration(
        context.user.accessToken,
        recalibrationData
      );

      console.log('✅ Recalibration saved successfully!');
      console.log('💾 ===== END SUBMITTING RECALIBRATION =====\n');

      setSuccess(true);
      setTimeout(() => {
        if (onSaveSuccess) onSaveSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('❌ Error submitting recalibration:', err);
      setError(err.message || 'Failed to submit recalibration');
    } finally {
      setSaving(false);
    }
  };

  const difference = actualBalance ? parseFloat(actualBalance) - systemBalance : 0;
  const deleteRecalibration = async () => {
    const ok = await confirm({ title: "Delete this week's recalibration?", body: 'The page reloads afterwards so every figure is worked out again.', confirmLabel: 'Delete recalibration', tone: 'danger' });
    if (!ok) return;
    try {
      await api.deleteOnlineCashRecalibration(context.user!.accessToken, lastRecalibration.id);
      toast.success('Recalibration deleted - reloading');
      // Force a full page reload to clear all caches
      window.setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Failed to delete recalibration: ' + (err as Error).message);
    }
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Paytm reconciliation"
      description={`${storeName} · ${new Date(targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
      dirty={!!actualBalance && !saving && !success}
      footer={
        <Button type="submit" form="paytm-recalibration-form" size="lg" fullWidth leadingIcon={<Save />} loading={saving} disabled={loading || !actualBalance}>
          Save recalibration
        </Button>
      }
    >
      {loading ? (
        <SkeletonListRows count={4} />
      ) : (
        <form id="paytm-recalibration-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {success && <Callout tone="success" title="Recalibration saved">The online cash balance has been updated.</Callout>}
          {error && <Callout tone="danger" title={error} />}

          {lastRecalibration && (
            <Callout
              tone="info"
              title={`Already counted for ${new Date(targetDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              action={<Button variant="danger-ghost" size="sm" onClick={deleteRecalibration}>Delete</Button>}
            >
              <span className="block">Created {lastRecalibration.createdAt ? formatDateTimeIST(lastRecalibration.createdAt) : 'N/A'} · date {lastRecalibration.date ? new Date(lastRecalibration.date).toLocaleDateString('en-IN') : 'N/A'}</span>
              <span className="num block">
                System {formatINR(lastRecalibration.systemBalance)} · counted {formatINR(lastRecalibration.actualBalance)} · difference {formatINR(lastRecalibration.difference, { sign: true })}
              </span>
              <span className="block">You can change the date, balance and notes below; saving updates this count.</span>
            </Callout>
          )}

          <StatTile label="Worked out by the app" value={<Money value={systemBalance} />} caption="From every Paytm receipt, online payout, expense and commission up to today." />

          <Field label="Balance in the Paytm app" required helper="Open the Paytm app and type the balance it shows">
            <MoneyInput value={actualBalance} onValueChange={(_, raw) => setActualBalance(raw)} allowNegative required />
          </Field>

          <Field label="Date of the count" required helper="Today unless you counted on another day">
            <Input type="date" value={manualDate || today} onChange={(e) => setManualDate(e.target.value)} max={today} required />
          </Field>

          {actualBalance && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <span className="flex flex-col">
                <span className="text-body-md font-medium text-text">Difference (counted − app)</span>
                {Math.abs(difference) > 0 && (
                  <span className="text-label text-text-3">{difference > 0 ? 'More on Paytm than the app expected (surplus)' : 'Less on Paytm than the app expected (shortage)'}</span>
                )}
              </span>
              <StatusChip tone={difference === 0 ? 'success' : difference > 0 ? 'warning' : 'danger'} icon={difference === 0 ? CheckCircle : AlertTriangle}>
                <span className="num">{formatINR(difference, { sign: true })}</span>
              </StatusChip>
            </div>
          )}

          <Field label="Notes" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Explain any difference or anything unusual" />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-medium text-text">What caused the difference</span>
            <SegmentedControl
              aria-label="What caused the difference"
              value={discrepancyType}
              onValueChange={setDiscrepancyType}
              options={[{ value: 'none', label: 'Nothing' }, { value: 'mistake', label: 'A mistake' }, { value: 'loan', label: 'A loan' }]}
            />
          </div>

          {discrepancyType === 'loan' && (
            <Field label="Loan amount">
              <MoneyInput value={loanAmount} onValueChange={(_, raw) => setLoanAmount(raw)} />
            </Field>
          )}

          <Callout tone="neutral" icon={Calendar} title="Count it every week">
            Check the Paytm balance every Sunday and log it here. Comparing it with the app's figure catches missed entries, fees or differences before they pile up.
          </Callout>
        </form>
      )}
    </ResponsiveModal>
  );
}

import { useState, useEffect } from 'react';
import { HandCoins, Mail, Phone, Trash2, UserPlus } from 'lucide-react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Button } from './ui/button';
import { IconButton } from './ui/icon-button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field } from './ui/field';
import { ListGroup, ListRow } from './ui/list-row';
import { InitialsAvatar } from './ui/avatar';
import { StatTile, StatGrid } from './ui/stat-tile';
import { StatusChip } from './ui/status-chip';
import { Money } from './ui/money';
import { EmptyState } from './ui/empty-state';
import { ResponsiveModal } from './ui/responsive-modal';
import { confirm } from './ui/confirm';
import { LoadingList } from './setup/SetupPage';
import { investorAnalytics } from './setup/investorMath';

type Props = {
  context: InventoryContextType;
};

type Investor = {
  id: string;
  name: string;
  contactNumber?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
};

// Investors and what each has lent (owner only, under Equipment and assets > Investments).
export function InvestmentsManagement({ context }: Props) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [loans, setLoans] = useState<api.OnlineLoan[]>([]);
  const [, setRepayments] = useState<any[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInvestors();
    loadLoans();
    loadRepayments();
  }, [context.user]);

  const loadInvestors = async () => {
    if (!context.user?.accessToken) return;
    try {
      setLoading(true);
      const data = await api.getInvestors(context.user.accessToken);
      setInvestors(data);
    } catch (error) {
      console.error('Error loading investors:', error);
      toast.error('Failed to load investors');
    } finally {
      setLoading(false);
    }
  };

  const loadLoans = async () => {
    if (!context.user?.accessToken) return;
    try {
      const data = await api.getAllOnlineLoans(context.user.accessToken);
      setLoans(data);
    } catch (error) {
      console.error('Error loading loans:', error);
    }
  };

  const loadRepayments = async () => {
    if (!context.user?.accessToken) return;
    try {
      const data = await api.getAllLoanRepayments(context.user.accessToken);
      setRepayments(data);
    } catch (error) {
      console.error('Error loading repayments:', error);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!context.user?.accessToken) return;

    try {
      setSaving(true);
      const investorData = {
        name,
        contactNumber,
        email,
        address,
        notes,
        createdBy: context.user.email,
      };

      if (editingInvestor) {
        await api.updateInvestor(context.user.accessToken, editingInvestor.id, investorData);
        toast.success('Investor updated');
      } else {
        await api.createInvestor(context.user.accessToken, investorData);
        toast.success('Investor added');
      }

      setShowAddModal(false);
      loadInvestors();
    } catch (error) {
      console.error('Error saving investor:', error);
      toast.error('Failed to save investor');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (investor: Investor) => {
    setEditingInvestor(investor);
    setName(investor.name);
    setContactNumber(investor.contactNumber || '');
    setEmail(investor.email || '');
    setAddress(investor.address || '');
    setNotes(investor.notes || '');
    setShowAddModal(true);
  };

  const handleDelete = async (investor: Investor) => {
    if (!context.user?.accessToken) return;
    const ok = await confirm({
      title: `Delete ${investor.name}?`,
      body: 'The investor is removed from this list. Their loans stay in Money > Loans.',
      confirmLabel: 'Delete investor',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await api.deleteInvestor(context.user.accessToken, investor.id);
      toast.success('Investor deleted');
      setShowAddModal(false);
      loadInvestors();
    } catch (error) {
      console.error('Error deleting investor:', error);
      toast.error('Failed to delete investor');
    }
  };

  const resetForm = () => {
    setName('');
    setContactNumber('');
    setEmail('');
    setAddress('');
    setNotes('');
    setEditingInvestor(null);
  };

  const dirty = editingInvestor
    ? name !== editingInvestor.name || contactNumber !== (editingInvestor.contactNumber || '') || email !== (editingInvestor.email || '') || address !== (editingInvestor.address || '') || notes !== (editingInvestor.notes || '')
    : !!(name || contactNumber || email || address || notes);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-text-2">Investors and the loans they have given</p>
        {investors.length > 0 && <Button leadingIcon={<UserPlus />} onClick={openAdd}>Add investor</Button>}
      </div>

      {loading ? (
        <LoadingList leading="avatar" rows={3} withTile />
      ) : investors.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={HandCoins}
            title="No investors yet"
            body="Add an investor to track the loans they give and what is still owed."
            action={<Button leadingIcon={<UserPlus />} onClick={openAdd}>Add investor</Button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {investors.map((investor) => {
            const analytics = investorAnalytics(loans, investor.id);
            const contact = [investor.contactNumber, investor.email].filter(Boolean).join(' · ');
            return (
              <section key={investor.id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-label={investor.name}>
                <button
                  type="button"
                  onClick={() => handleEdit(investor)}
                  className="-mx-2 -mt-1 flex min-h-12 items-center gap-3 rounded-md px-2 text-left outline-none hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <InitialsAvatar name={investor.name} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-md font-semibold text-text">{investor.name}</span>
                    {contact && (
                      <span className="flex items-center gap-1.5 truncate text-label text-text-3">
                        {investor.contactNumber ? <Phone className="size-3.5 shrink-0" aria-hidden="true" /> : <Mail className="size-3.5 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{contact}</span>
                      </span>
                    )}
                  </span>
                  {analytics.activeLoans > 0 && (
                    <StatusChip tone="info">{analytics.activeLoans} active loan{analytics.activeLoans !== 1 ? 's' : ''}</StatusChip>
                  )}
                </button>

                <StatGrid>
                  <StatTile label="Total lent" value={<Money value={analytics.totalLent} />} />
                  <StatTile label="Total repaid" value={<Money value={analytics.totalRepaid} />} />
                  <StatTile label="Interest accrued" value={<Money value={analytics.totalInterest} decimals={2} />} />
                  <StatTile label="Outstanding" value={<Money value={analytics.outstanding} decimals={2} />} />
                </StatGrid>

                {analytics.investorLoans.length > 0 && (
                  <ListGroup overline="Recent loans">
                    {analytics.investorLoans.slice(0, 5).map((loan) => (
                      <ListRow
                        key={loan.id}
                        density="compact"
                        title={<Money value={loan.loanAmount} className="font-medium" />}
                        subtitle={<span className="num">{loan.loanDate} · {loan.interestRate || 0}% interest</span>}
                        trailing={<StatusChip tone={loan.status === 'active' ? 'success' : 'neutral'}>{loan.status === 'active' ? 'Active' : loan.status}</StatusChip>}
                      />
                    ))}
                  </ListGroup>
                )}

                {investor.notes && (
                  <div className="flex flex-col gap-1 border-t border-border pt-3">
                    <span className="text-label text-text-3">Notes</span>
                    <p className="text-body-sm text-text">{investor.notes}</p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <ResponsiveModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onClosed={resetForm}
        title={editingInvestor ? 'Edit investor' : 'Add investor'}
        dirty={dirty && !saving}
        footer={
          <>
            {editingInvestor && (
              <IconButton variant="danger-ghost" label="Delete investor" icon={<Trash2 />} onClick={() => handleDelete(editingInvestor)} disabled={saving} />
            )}
            <Button size="lg" className="flex-1" loading={saving} disabled={!name} onClick={() => handleSubmit()}>
              {editingInvestor ? 'Save investor' : 'Add investor'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Investor name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
          </Field>
          <Field label="Contact number" optional>
            <Input type="tel" inputMode="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} leading={<Phone className="size-5" />} />
          </Field>
          <Field label="Email" optional>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} leading={<Mail className="size-5" />} />
          </Field>
          <Field label="Address" optional>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </Field>
          <Field label="Notes" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything to remember about this investor" />
          </Field>
          <button type="submit" className="sr-only" tabIndex={-1}>Save</button>
        </form>
      </ResponsiveModal>
    </div>
  );
}

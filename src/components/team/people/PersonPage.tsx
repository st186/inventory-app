// One person's page (Team → People → a person), pushed on top of the list so Android Back
// returns to it. Header with call / WhatsApp, then Contact · Employment · Documents · Pay
// components · Actions, and Deactivate in a separate danger group.
//
// Privacy, as the server already enforces it: Aadhaar photos only for the owner and the person
// themself (everyone else sees "On file"); pay, date of birth and phone arrive only for managers,
// the owner and audit, so they simply don't show for anyone else.
import * as React from 'react';
import { ArrowLeft, Building2, ChevronDown, ChevronUp, FileImage, KeyRound, MessageCircle, Pencil, Phone, Store, UserCog, UserMinus, Users } from 'lucide-react';
import { Button } from '../../ui/button';
import { IconButton } from '../../ui/icon-button';
import { InitialsAvatar } from '../../ui/avatar';
import { ListGroup, ListRow } from '../../ui/list-row';
import { Money } from '../../ui/money';
import { Skeleton } from '../../ui/skeleton';
import { StatusChip } from '../../ui/status-chip';
import { confirm } from '../../ui/confirm';
import { toast } from '../../ui/sonner';
import type * as api from '../../../utils/api';
import { ForcePasswordResetButton } from '../../ForcePasswordResetButton';
import { EmployeeDetailsModal } from '../../EmployeeDetailsModal';
import { teamApi } from '../teamApi';
import { DetailList, TeamPage, errorText, phoneLinks } from '../shared';
import { chipFor, DESIGNATION_LABELS, formatJoin, placeName, roleLine, typeLabel, type Employee } from './peopleUtils';
import { EditPersonForm } from './PersonForms';
import { AssignDesignationSheet, AssignSupervisorSheet, ChangeStoreSheet, ManageAccessSheet, ResetPasswordSheet } from './OwnerSheets';

type Sheet = 'edit' | 'password' | 'role' | 'supervisor' | 'store' | 'access' | 'designation' | null;

export function PersonPage({
  person,
  viewer,
  stores,
  productionHouses,
  nameOf,
  onBack,
  onChanged,
  onDeactivated,
}: {
  person: Employee;
  viewer: { isClusterHead: boolean; employeeId?: string };
  stores: api.Store[];
  productionHouses: api.ProductionHouse[];
  nameOf: (id?: string) => string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
  onDeactivated: () => void;
}) {
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [deactivating, setDeactivating] = React.useState(false);
  const isOwner = viewer.isClusterHead;
  const isSelf = !!viewer.employeeId && person.employeeId === viewer.employeeId;
  const links = phoneLinks(person.phone);
  const chip = chipFor(person);
  const place = placeName(person, stores, productionHouses);
  const parts = person.salaryStructure || [];
  const fixedTotal = parts.reduce((s, c) => s + (c.amount || 0), 0);

  const deactivate = async () => {
    const ok = await confirm({
      title: `Deactivate ${person.name}?`,
      body: 'They move to Past people and their login is switched off. Their pay history is kept.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    setDeactivating(true);
    try {
      const result = await teamApi.deleteUnifiedEmployee(person.employeeId);
      toast.success(
        result?.loginRevoked === false
          ? 'Moved to Past people. Their login could not be banned just now; the app refuses it anyway.'
          : 'Moved to Past people and their login is switched off.',
      );
      onDeactivated();
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error(`Couldn't deactivate: ${errorText(error, 'unknown error')}`);
    } finally {
      setDeactivating(false);
    }
  };

  const close = () => setSheet(null);
  return (
    <TeamPage data-ai-private>
      <div className="-mx-2 -mt-2 flex items-center">
        <Button variant="ghost" leadingIcon={<ArrowLeft />} onClick={onBack} className="px-2">
          People
        </Button>
      </div>

      <section className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface p-5 text-center sm:flex-row sm:text-left">
        <InitialsAvatar name={person.name} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-title-lg font-semibold text-text">{person.name}</h2>
          <p className="text-body-sm text-text-2">{[roleLine(person), place].filter(Boolean).join(' · ')}</p>
          <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
            <StatusChip tone={person.status === 'active' ? 'success' : 'neutral'} dot>
              {person.status === 'active' ? 'Active' : 'Inactive'}
            </StatusChip>
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            {chip.tone === 'brand' && person.role !== 'cluster_head' && <StatusChip tone="neutral">{typeLabel(person)}</StatusChip>}
          </div>
        </div>
        {links && (
          <div className="flex gap-2">
            <IconButton label={`Call ${person.name}`} icon={<Phone />} variant="secondary" href={links.tel} />
            <IconButton label={`WhatsApp ${person.name}`} icon={<MessageCircle />} variant="secondary" href={links.whatsapp} />
          </div>
        )}
      </section>

      <ListGroup overline="Contact">
        <ListRow density="compact" title="Phone" trailing={<span className="text-body-sm text-text-2">{person.phone || 'Not added'}</span>} />
        <ListRow density="compact" title="Email" subtitle={person.email} />
        {person.dob && <ListRow density="compact" title="Date of birth" trailing={<span className="text-body-sm text-text-2">{formatJoin(person.dob)}</span>} />}
      </ListGroup>

      <section aria-labelledby="employment-h" className="flex flex-col">
        <h2 id="employment-h" className="overline-label mx-1 mb-2">Employment</h2>
        <DetailList
          rows={[
            { label: 'Employee ID', value: <span className="num">{person.employeeId}</span> },
            { label: 'Type', value: typeLabel(person) },
            { label: 'Role', value: person.role === 'cluster_head' ? 'Owner' : person.role === 'manager' ? 'Manager' : 'Staff' },
            { label: 'Designation', value: person.designation ? DESIGNATION_LABELS[person.designation] || person.designation : '', hidden: !person.designation },
            { label: 'Department', value: person.department === 'store_operations' ? 'Store operations' : 'Production', hidden: !person.department },
            { label: 'Works at', value: place || person.storeId || '', hidden: !person.storeId },
            { label: 'Reports to (manager)', value: nameOf(person.managerId), hidden: !person.managerId },
            { label: 'Reports to (incharge)', value: nameOf(person.inchargeId), hidden: !person.inchargeId },
            { label: 'Joined', value: formatJoin(person.joiningDate) },
            { label: 'Added by', value: person.createdBy || '', hidden: !person.createdBy },
          ]}
        />
      </section>

      <DocumentsSection person={person} canSeeImages={isOwner || isSelf} />

      {(parts.length > 0 || person.dailyRate) && (
        <ListGroup overline="Pay components" footer={parts.length > 0 ? 'Variable pay is entered with each payout.' : undefined}>
          {parts.map((c, i) => (
            <ListRow key={i} density="compact" title={c.label || 'Part'} amount={c.amount || 0} />
          ))}
          {parts.length > 0 && <ListRow density="compact" title="Fixed total a month" trailing={<Money value={fixedTotal} className="text-body-md font-semibold" />} />}
          {person.dailyRate ? <ListRow density="compact" title="Daily rate" amount={person.dailyRate} /> : null}
        </ListGroup>
      )}

      <ListGroup overline="Actions">
        <ListRow icon={Pencil} title="Edit details" subtitle="Name, contact, joining date, salary parts" onClick={() => setSheet('edit')} />
        <ListRow icon={KeyRound} title="Reset password" subtitle="Set a new password and share it with them" onClick={() => setSheet('password')} />
        {isOwner && !isSelf && <ForcePasswordResetButton employee={person} trigger="row" />}
        {isOwner && <ListRow icon={UserCog} title="Role and designation" subtitle="Permission level and job title" onClick={() => setSheet('role')} />}
        {isOwner && person.role === 'employee' && <ListRow icon={Users} title="Assign supervisor" subtitle="Operations manager or incharge" onClick={() => setSheet('supervisor')} />}
        {isOwner && person.role === 'employee' && <ListRow icon={UserCog} title="Make incharge" subtitle="Store or production incharge" onClick={() => setSheet('designation')} />}
        {isOwner && person.role !== 'cluster_head' && <ListRow icon={Store} title="Change store" onClick={() => setSheet('store')} />}
        {isOwner && person.role === 'manager' && <ListRow icon={Building2} title="Manage access" subtitle="Several stores or production houses" onClick={() => setSheet('access')} />}
      </ListGroup>

      <ListGroup>
        <ListRow
          icon={UserMinus}
          iconTone="danger"
          title={<span className="text-danger">Deactivate</span>}
          subtitle="Moves them to Past people and switches their login off"
          onClick={deactivating ? undefined : deactivate}
          disabled={deactivating}
        />
      </ListGroup>

      <EditPersonForm person={person} open={sheet === 'edit'} onOpenChange={(o) => setSheet(o ? 'edit' : null)} onSaved={onChanged} />
      <ResetPasswordSheet person={person} open={sheet === 'password'} onOpenChange={(o) => setSheet(o ? 'password' : null)} />
      {isOwner && (
        <>
          {sheet === 'role' && <EmployeeDetailsModal employee={person} onClose={close} onSave={() => onChanged()} />}
          <AssignSupervisorSheet person={person} open={sheet === 'supervisor'} onOpenChange={(o) => setSheet(o ? 'supervisor' : null)} onDone={onChanged} nameOf={nameOf} />
          <ChangeStoreSheet person={person} open={sheet === 'store'} onOpenChange={(o) => setSheet(o ? 'store' : null)} onDone={onChanged} stores={stores} productionHouses={productionHouses} />
          <ManageAccessSheet person={person} open={sheet === 'access'} onOpenChange={(o) => setSheet(o ? 'access' : null)} onDone={onChanged} stores={stores} productionHouses={productionHouses} />
          <AssignDesignationSheet person={person} open={sheet === 'designation'} onOpenChange={(o) => setSheet(o ? 'designation' : null)} onDone={onChanged} />
        </>
      )}
    </TeamPage>
  );
}

/**
 * Aadhaar card: opened on demand. For the owner and the person themself the photos load from
 * GET /employees/:id/documents (falling back to what the list already carried); everyone else
 * only learns whether a card is on file.
 */
function DocumentsSection({ person, canSeeImages }: { person: Employee; canSeeImages: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [docs, setDocs] = React.useState<{ front?: string; back?: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const onFile = !!(person.hasAadharImages || person.aadharFront || person.aadharBack);

  React.useEffect(() => {
    setDocs(null);
    setOpen(false);
  }, [person.employeeId]);

  React.useEffect(() => {
    if (!open || !canSeeImages || docs) return;
    let cancelled = false;
    setLoading(true);
    teamApi
      .getEmployeeDocuments(person.employeeId)
      .then((d: { aadharFront?: string | null; aadharBack?: string | null }) => {
        if (!cancelled) setDocs({ front: d.aadharFront || person.aadharFront, back: d.aadharBack || person.aadharBack });
      })
      .catch(() => {
        // Older server without the documents route: the full list still carries the photos.
        if (!cancelled) setDocs({ front: person.aadharFront, back: person.aadharBack });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, canSeeImages, docs, person.employeeId, person.aadharFront, person.aadharBack]);

  if (!canSeeImages) {
    return (
      <ListGroup overline="Documents">
        <ListRow density="compact" icon={FileImage} title="Aadhaar card" trailing={<StatusChip tone={onFile ? 'success' : 'neutral'}>{onFile ? 'On file' : 'Not added'}</StatusChip>} />
      </ListGroup>
    );
  }

  return (
    <ListGroup overline="Documents">
      <ListRow
        icon={FileImage}
        title="Aadhaar card"
        subtitle={onFile ? 'Front and back photos' : 'No photos added'}
        chevron={false}
        trailing={onFile ? (open ? <ChevronUp className="size-5 text-text-3" aria-hidden="true" /> : <ChevronDown className="size-5 text-text-3" aria-hidden="true" />) : undefined}
        onClick={onFile ? () => setOpen((o) => !o) : undefined}
        aria-expanded={onFile ? open : undefined}
      />
      {open && (
        <div className="grid grid-cols-1 gap-3 p-4 min-[480px]:grid-cols-2">
          {loading || !docs ? (
            <>
              <Skeleton className="aspect-[3/2] w-full" />
              <Skeleton className="aspect-[3/2] w-full" />
            </>
          ) : (
            <>
              {docs.front ? <img src={docs.front} alt="Aadhaar card, front" className="w-full rounded-md border border-border" /> : <p className="text-body-sm text-text-3">No front photo</p>}
              {docs.back ? <img src={docs.back} alt="Aadhaar card, back" className="w-full rounded-md border border-border" /> : <p className="text-body-sm text-text-3">No back photo</p>}
            </>
          )}
        </div>
      )}
    </ListGroup>
  );
}

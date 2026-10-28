// Team → People (owner and manager logins): the staff list, a person's page, Add person, and the
// owner's tools. Attendance, Pay and the org structure are Team / Setup destinations of their own
// now (shell/navConfig.ts), so this screen no longer carries them as sub-tabs.
//
// Who loads what, as before: managers their own staff (GET /unified-employees/manager/:id), the
// owner everyone (filtered to the chosen store), plus past staff, stores and production houses.
import { useEffect, useMemo, useState } from 'react';
import * as api from '../utils/api';
import { employeeBelongsToStore } from '../utils/entityAccess';
import { confirm } from './ui/confirm';
import { toast } from './ui/sonner';
import { teamApi } from './team/teamApi';
import { errorText, useSubPage } from './team/shared';
import { PeopleList, type ArchivedPerson } from './team/people/PeopleList';
import { PersonPage } from './team/people/PersonPage';
import { AddPersonForm } from './team/people/PersonForms';
import { MigrationResultSheet, type MigrationResult } from './team/people/OwnerSheets';
import type { Employee } from './team/people/peopleUtils';

interface EmployeeManagementProps {
  user: {
    role: string;
    email: string;
    employeeId?: string;
    name: string;
    storeId?: string | null;
    accessToken?: string;
  };
  selectedStoreId?: string | null;
  /** Older notification links; attendance now has its own Team → Attendance page, so this is unused. */
  initialAttendanceTab?: string | null;
}

export function EmployeeManagement({ user, selectedStoreId }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [archivedEmployees, setArchivedEmployees] = useState<ArchivedPerson[]>([]);
  const [stores, setStores] = useState<api.Store[]>([]);
  const [productionHouses, setProductionHouses] = useState<api.ProductionHouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [migration, setMigration] = useState<MigrationResult | null>(null);
  const [personId, openPerson, closePerson] = useSubPage('person');

  const isManager = user.role === 'manager';
  const isClusterHead = user.role === 'cluster_head';

  const loadProductionHouses = async () => {
    try {
      setProductionHouses(await teamApi.getProductionHouses());
    } catch (error) {
      if (error instanceof Error && (error.message === 'Not authenticated' || error.message === 'Unauthorized')) return;
      console.error('Error loading production houses:', error);
    }
  };

  const loadStores = async () => {
    try {
      setStores(await teamApi.getStores());
    } catch (error) {
      if (error instanceof Error && (error.message === 'Not authenticated' || error.message === 'Unauthorized')) return;
      console.error('Error loading stores:', error);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      let data: Employee[];
      if (isManager && user.employeeId) {
        data = await teamApi.getEmployeesByManager(user.employeeId);
      } else if (isClusterHead) {
        data = await teamApi.getAllEmployees();
        // A chosen store also matches its linked production house (entityAccess.ts).
        if (selectedStoreId) data = data.filter((emp) => employeeBelongsToStore(emp, selectedStoreId, stores));
      } else {
        data = await teamApi.getAllEmployees();
      }
      setEmployees(data);
      try {
        setArchivedEmployees(await teamApi.getArchivedEmployees());
      } catch (archiveError) {
        console.error('Error loading archived employees:', archiveError);
      }
    } catch (error) {
      console.error('Error loading employees:', error);
      setLoadError(errorText(error, "Couldn't load your team. Check the internet and try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    if (isClusterHead) {
      loadStores();
      loadProductionHouses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const nameOf = useMemo(
    () => (id?: string) => {
      if (!id) return 'No manager assigned';
      const found = employees.find((e) => e.employeeId === id);
      return found ? `${found.name} (${found.employeeId})` : `Manager ${id}`;
    },
    [employees],
  );

  const handleRestore = async (emp: ArchivedPerson) => {
    const ok = await confirm({
      title: `Bring ${emp.name} back?`,
      body: `${emp.employeeId} becomes an active employee again and their login is switched back on.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      setBusy(true);
      const result = await teamApi.restoreArchivedEmployee(emp.employeeId);
      toast.success(
        result?.loginRestored === false
          ? 'Restored, but their login could not be switched back on. Reset their password to fix it.'
          : 'Restored and their login is switched back on.',
      );
      await loadEmployees();
    } catch (error) {
      toast.error(`Couldn't restore: ${errorText(error, String(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const handleMigrateStores = async () => {
    const ok = await confirm({
      title: 'Fill in missing stores?',
      body: "Every employee gets their manager's store where one is missing.",
      confirmLabel: 'Fill in stores',
    });
    if (!ok) return;
    try {
      setBusy(true);
      setMigration(await teamApi.migrateEmployeeStores());
      await loadEmployees();
    } catch (error) {
      console.error('Error running migration:', error);
      toast.error(`Migration failed: ${errorText(error, String(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncDesignations = async () => {
    const ok = await confirm({
      title: 'Sync designations to logins?',
      body: 'Copies each store and production incharge designation to their login, so they get their full menus.',
      confirmLabel: 'Sync designations',
    });
    if (!ok) return;
    try {
      setBusy(true);
      const result = await teamApi.syncDesignations();
      toast.success(
        `Synced ${result.synced} designations.${result.skipped > 0 ? ` Skipped ${result.skipped} (no designation or no login).` : ''} Incharges should sign out and back in.`,
      );
      await loadEmployees();
    } catch (error) {
      console.error('Error syncing designations:', error);
      toast.error(`Sync failed: ${errorText(error, String(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const person = personId ? employees.find((e) => e.employeeId === personId) : undefined;

  return (
    <>
      {personId && person ? (
        <PersonPage
          person={person}
          viewer={{ isClusterHead, employeeId: user.employeeId }}
          stores={stores}
          productionHouses={productionHouses}
          nameOf={nameOf}
          onBack={closePerson}
          onChanged={loadEmployees}
          onDeactivated={() => {
            closePerson();
            loadEmployees();
          }}
        />
      ) : (
        <PeopleList
          employees={employees}
          archived={archivedEmployees}
          loading={loading}
          error={loadError}
          onRetry={loadEmployees}
          isClusterHead={isClusterHead}
          stores={stores}
          productionHouses={productionHouses}
          onOpen={openPerson}
          onAdd={() => setAdding(true)}
          onRestore={handleRestore}
          onMigrate={handleMigrateStores}
          onSyncDesignations={handleSyncDesignations}
          busy={busy}
        />
      )}
      <AddPersonForm
        open={adding}
        onOpenChange={setAdding}
        isClusterHead={isClusterHead}
        isManager={isManager}
        stores={stores}
        user={{ email: user.email, employeeId: user.employeeId, storeId: user.storeId }}
        onCreated={loadEmployees}
      />
      <MigrationResultSheet result={migration} open={!!migration} onOpenChange={(o) => !o && setMigration(null)} />
    </>
  );
}

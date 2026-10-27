import { useState, useEffect } from 'react';
import { Network } from 'lucide-react';
import * as api from '../utils/api';
import { useT, hasTranslation, type I18nKey } from '../utils/i18n';
import { InitialsAvatar } from './ui/avatar';
import { StatusChip } from './ui/status-chip';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { cn } from './ui/utils';
import { SetupPage, LoadingList } from './setup/SetupPage';

type Employee = api.Employee;

interface EmployeeHierarchyViewProps {
  currentUser: {
    employeeId: string;
    role: string;
    email: string;
    name: string;
  };
}

// The signed-in person's reporting chain, from the top (cluster head) down to them.
export function EmployeeHierarchyView({ currentUser }: EmployeeHierarchyViewProps) {
  const { t, lang } = useT();
  const [reportingChain, setReportingChain] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    try {
      setLoading(true);
      setError(null);
      const allEmployees = await api.getAllEmployees();

      // Find current user's full record
      const currentUserRecord = allEmployees.find(
        (emp: Employee) => emp.employeeId === currentUser.employeeId
      );

      if (!currentUserRecord) {
        setLoading(false);
        return;
      }

      // Build the reporting chain from current user UP to cluster head
      const chainFromBottom: Employee[] = [currentUserRecord];
      let currentPerson = currentUserRecord;
      let iterations = 0;
      const maxIterations = 10;

      while (currentPerson && iterations < maxIterations) {
        const superiorId = currentPerson.clusterHeadId || currentPerson.managerId || currentPerson.inchargeId;

        if (!superiorId) break;

        const superior = allEmployees.find(
          (emp: Employee) => emp.employeeId === superiorId
        );

        if (superior) {
          // Check if we already have this person (prevent circular references)
          if (chainFromBottom.some(emp => emp.employeeId === superior.employeeId)) {
            break;
          }

          chainFromBottom.push(superior);
          currentPerson = superior;

          // If we reached cluster head, stop
          if (superior.role === 'cluster_head') {
            break;
          }
        } else {
          break;
        }

        iterations++;
      }

      // Reverse the chain so it goes from top (cluster head) to bottom (employee)
      setReportingChain(chainFromBottom.reverse());
    } catch (err) {
      console.error('Error loading hierarchy:', err);
      setError(t('org.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Designation first, role for older records without one.
  const roleLabel = (designation?: string | null, role?: string) => {
    if (designation) {
      const key = `org.d.${designation}` as I18nKey;
      return hasTranslation('en', key) ? t(key) : designation;
    }
    if (role) {
      const key = `org.r.${role}` as I18nKey;
      return hasTranslation('en', key) ? t(key) : role;
    }
    return '';
  };

  return (
    <SetupPage>
      <div className="flex flex-col gap-1" lang={lang}>
        <h2 className="text-subtitle font-semibold text-text">{t('org.chainTitle')}</h2>
        <p className="text-body-sm text-text-2">{t('org.chainBody')}</p>
      </div>
      {loading ? (
        <LoadingList leading="avatar" rows={3} />
      ) : error ? (
        <ErrorState body={error} onRetry={loadHierarchy} />
      ) : reportingChain.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Network} title={t('org.noChainTitle')} body={t('org.noChainBody')} />
        </div>
      ) : (
        <ol className="flex flex-col" lang={lang}>
          {reportingChain.map((person, index) => {
            const isCurrentUser = person.employeeId === currentUser.employeeId;
            const isLast = index === reportingChain.length - 1;
            return (
              <li key={person.employeeId} className="flex gap-3">
                {/* The line down to the next person */}
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <InitialsAvatar name={person.name} size={40} />
                  {!isLast && <span className="my-1 w-px flex-1 bg-border-strong" aria-hidden="true" />}
                </div>
                <div className={cn('mb-3 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg border px-4 py-2.5', isCurrentUser ? 'border-primary bg-primary-soft' : 'border-border bg-surface')}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-md font-semibold text-text">{person.name}</span>
                    <span className="truncate text-label text-text-2">{[roleLabel(person.designation, person.role), person.employeeId].filter(Boolean).join(' · ')}</span>
                  </div>
                  {isCurrentUser && <StatusChip tone="brand">{t('org.you')}</StatusChip>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </SetupPage>
  );
}

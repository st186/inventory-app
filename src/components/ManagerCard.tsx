import type { ReactNode } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { Employee } from '../utils/api';
import { InitialsAvatar } from './ui/avatar';

interface ManagerNode extends Employee {
  employees?: Employee[];
  managers?: ManagerNode[];
}

interface ManagerCardProps {
  manager: ManagerNode;
  level?: number;
}

// Format designation for display
export const formatDesignation = (designation?: string | null, fallback = 'Manager') => {
  if (!designation) return fallback;

  const designationMap: Record<string, string> = {
    'operations_incharge': 'Operations incharge',
    'operations_manager': 'Operations manager',
    'store_incharge': 'Store incharge',
    'production_incharge': 'Production incharge',
    'store_ops': 'Store operations',
    'production_ops': 'Production operations',
    'rider': 'Rider',
  };

  return designationMap[designation] || designation;
};

/** One person in the org tree: indented under whoever they report to. */
export function TreeRow({ depth, name, meta, trailing, onClick }: { depth: number; name: string; meta?: ReactNode; trailing?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      {depth > 0 && <CornerDownRight className="size-4 shrink-0 text-text-disabled" aria-hidden="true" />}
      <InitialsAvatar name={name} size={depth === 0 ? 40 : 32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-md font-medium text-text">{name}</span>
        {meta && <span className="line-clamp-2 text-label text-text-3">{meta}</span>}
      </span>
      {trailing}
    </>
  );
  const style = { paddingLeft: 16 + Math.min(depth, 4) * 20 };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={style} className="flex min-h-14 w-full items-center gap-3 py-2 pr-4 text-left outline-none transition-colors hover:bg-surface-2/60 active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        {body}
      </button>
    );
  }
  return <div style={style} className="flex min-h-14 items-center gap-3 py-2 pr-4">{body}</div>;
}

// A manager and everyone under them (recursive), as rows inside the parent's ListGroup.
export function ManagerCard({ manager, level = 0 }: ManagerCardProps) {
  return (
    <>
      <TreeRow depth={level} name={manager.name} meta={`${formatDesignation(manager.designation)} · ${manager.employeeId}`} />
      {manager.managers?.map((subManager) => (
        <ManagerCard key={subManager.employeeId} manager={subManager} level={level + 1} />
      ))}
      {manager.employees?.map((employee) => (
        <TreeRow key={employee.employeeId} depth={level + 1} name={employee.name} meta={employee.employeeId} />
      ))}
    </>
  );
}

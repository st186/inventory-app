import { useId } from 'react';
import type { Employee } from '../utils/api';
import { Checkbox } from './ui/checkbox';

type Props = {
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
};

// Tick everyone an expense covers. Each row is a 52 px tappable label with a checkbox, name and
// employee ID; the count shows underneath.
export function EmployeeMultiSelect({ employees, selectedIds, onChange, label = 'Employees Covered' }: Props) {
  const groupId = useId();
  const toggle = (employeeId: string) => {
    if (selectedIds.includes(employeeId)) {
      onChange(selectedIds.filter((id) => id !== employeeId));
    } else {
      onChange([...selectedIds, employeeId]);
    }
  };

  return (
    <div role="group" aria-labelledby={`${groupId}-label`} className="flex flex-col gap-1.5">
      <span id={`${groupId}-label`} className="text-body-sm font-medium text-text">
        {label}
        <span className="font-normal text-text-3"> · select everyone this covers</span>
      </span>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border-strong bg-surface [&>*+*]:border-t [&>*+*]:border-border">
        {employees.length === 0 && (
          <p className="p-3 text-body-sm text-text-3">No employees available</p>
        )}
        {employees.map((emp) => {
          const id = `${groupId}-${emp.employeeId}`;
          return (
            <label
              key={emp.employeeId}
              htmlFor={id}
              className="flex min-h-13 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-surface-2/60 active:bg-surface-2"
            >
              <Checkbox
                id={id}
                checked={selectedIds.includes(emp.employeeId)}
                onCheckedChange={() => toggle(emp.employeeId)}
              />
              <span className="min-w-0 flex-1 text-body-md text-text">{emp.name}</span>
              <span className="num text-label text-text-3">{emp.employeeId}</span>
            </label>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <p className="num text-caption text-text-3">{selectedIds.length} employee(s) selected</p>
      )}
    </div>
  );
}

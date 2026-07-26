import { Employee } from '../utils/api';

type Props = {
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
};

export function EmployeeMultiSelect({ employees, selectedIds, onChange, label = 'Employees Covered' }: Props) {
  const toggle = (employeeId: string) => {
    if (selectedIds.includes(employeeId)) {
      onChange(selectedIds.filter((id) => id !== employeeId));
    } else {
      onChange([...selectedIds, employeeId]);
    }
  };

  return (
    <div>
      <label className="block text-sm text-gray-700 mb-1">
        {label}
        <span className="text-xs text-gray-500 ml-2">(select everyone this covers)</span>
      </label>
      <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
        {employees.length === 0 && (
          <p className="text-sm text-gray-500 p-3">No employees available</p>
        )}
        {employees.map((emp) => (
          <label
            key={emp.employeeId}
            className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(emp.employeeId)}
              onChange={() => toggle(emp.employeeId)}
              className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 flex-shrink-0"
            />
            <span className="text-sm text-gray-900">{emp.name}</span>
            <span className="text-xs text-gray-500">{emp.employeeId}</span>
          </label>
        ))}
      </div>
      {selectedIds.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">{selectedIds.length} employee(s) selected</p>
      )}
    </div>
  );
}

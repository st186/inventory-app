import React, { useState, useEffect } from 'react';
import { X, UserPlus, Check, AlertCircle, Mail, Lock } from 'lucide-react';
import { publicAnonKey } from '../utils/supabase/info';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  type: string;
  monthlySalary?: number;
  email?: string;
}

interface EmployeeAccountSetupProps {
  onClose: () => void;
  employees: Employee[];
}

export function EmployeeAccountSetup({ onClose, employees }: EmployeeAccountSetupProps) {
  const [permanentEmployees, setPermanentEmployees] = useState<Employee[]>([]);
  const [credentials, setCredentials] = useState<Record<string, { email: string; password: string }>>({});
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{ deleted: number; failed: number; message?: string; details: any[] } | null>(null);

  useEffect(() => {
    // Filter only permanent employees (type === 'fulltime')
    const permanent = employees.filter(emp => emp.type === 'fulltime' || emp.type === 'Permanent');
    setPermanentEmployees(permanent);

    // Initialize credentials with default email pattern
    const initialCredentials: Record<string, { email: string; password: string }> = {};
    permanent.forEach(emp => {
      const defaultEmail = emp.email || `${emp.name.toLowerCase().replace(/\s+/g, '.')}@bhandar.com`;
      const defaultPassword = `Bhandar@${emp.employeeId}`;
      initialCredentials[emp.id] = { email: defaultEmail, password: defaultPassword };
    });
    setCredentials(initialCredentials);
  }, [employees]);

  const handleCredentialChange = (empId: string, field: 'email' | 'password', value: string) => {
    setCredentials(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }));
  };

  const createAccounts = async () => {
    setProcessing(true);
    setResults(null);

    try {
      if (permanentEmployees.length === 0) {
        alert('No permanent employees found. Please add permanent employees first.');
        setProcessing(false);
        return;
      }

      const employeeData = permanentEmployees.map(emp => ({
        name: emp.name,
        email: credentials[emp.id].email,
        password: credentials[emp.id].password,
        employeeId: emp.employeeId
      }));

      console.log('Creating accounts for employees:', employeeData);

      const response = await fetch(
        `https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/auth/create-employee-accounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ employees: employeeData })
        }
      );

      const result = await response.json();
      console.log('Server response:', result);

      if (!response.ok) {
        console.error('Server error:', result);
        throw new Error(result.error || `Failed to create accounts (Status: ${response.status})`);
      }

      setResults({
        deleted: result.deleted || 0,
        failed: result.failed,
        message: result.message,
        details: [...(result.results || []), ...(result.errors || [])]
      });
    } catch (error) {
      console.error('Error creating employee accounts:', error);
      alert(`Failed to create employee accounts: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  const downloadCredentials = () => {
    const data = permanentEmployees.map(emp => ({
      'Employee ID': emp.employeeId,
      'Name': emp.name,
      'Email': credentials[emp.id].email,
      'Password': credentials[emp.id].password,
      'Monthly Salary': emp.monthlySalary || 0
    }));

    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee-credentials.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl">Prepare Employee Login Credentials</h2>
              <p className="text-sm text-gray-600">Generate signup credentials for {permanentEmployees.length} permanent employees</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {results ? (
            <div className="space-y-4">
              {/* Important Message */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="flex items-center gap-2 text-yellow-800 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">Important: Employees Must Complete Signup</span>
                </h3>
                <p className="text-yellow-700 text-sm mb-2">
                  {results.message || 'Old accounts have been deleted. Employees must now signup using their credentials below.'}
                </p>
                <p className="text-yellow-700 text-sm">
                  Download the credentials below and share them with employees. They should go to the login page and click "Sign up" to create their accounts.
                </p>
              </div>

              {/* Results Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Check className="w-5 h-5" />
                    <span>Accounts Prepared</span>
                  </div>
                  <div className="text-2xl mt-2">{results.deleted}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span>Failed</span>
                  </div>
                  <div className="text-2xl mt-2">{results.failed}</div>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="space-y-2">
                {results.details.map((detail, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      detail.status === 'created'
                        ? 'bg-green-50 border-green-200'
                        : detail.status === 'updated'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{detail.email}</span>
                      <span className="text-sm">
                        {detail.status === 'created' && <span className="text-green-700">✓ Created</span>}
                        {detail.status === 'updated' && <span className="text-blue-700">✓ Updated</span>}
                        {detail.error && <span className="text-red-700">✗ {detail.error}</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  ✓ All accounts have been processed. Download the credentials CSV to share login information with employees.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Review and modify the email addresses and passwords below before creating accounts. Default passwords follow the pattern: Bhandar@{'{EmployeeID}'}
                </p>
              </div>

              <div className="space-y-3">
                {permanentEmployees.map((emp) => (
                  <div key={emp.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm">{emp.name}</div>
                        <div className="text-xs text-gray-600">ID: {emp.employeeId}</div>
                      </div>
                      {emp.email && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Has Account
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={credentials[emp.id]?.email || ''}
                          onChange={(e) => handleCredentialChange(emp.id, 'email', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          placeholder="employee@bhandar.com"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Password
                        </label>
                        <input
                          type="text"
                          value={credentials[emp.id]?.password || ''}
                          onChange={(e) => handleCredentialChange(emp.id, 'password', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          placeholder="Password123"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <button
              onClick={downloadCredentials}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Download Credentials CSV
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
              {!results && (
                <button
                  onClick={createAccounts}
                  disabled={processing}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Preparing Credentials...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Prepare Signup Credentials
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
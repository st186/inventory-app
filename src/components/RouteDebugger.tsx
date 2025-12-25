import { useState } from 'react';
import { Bug, CheckCircle, XCircle, Loader } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function RouteDebugger({ managerId }: { managerId: string }) {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const testRoute = async () => {
    setTesting(true);
    setResults(null);

    const tests = {
      serverVersion: null as any,
      managerRoute: null as any,
      allEmployees: null as any
    };

    try {
      // Test 1: Check if server is running
      console.log('Testing server health...');
      const serverTest = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/unified-employees`,
        {
          headers: { 'Authorization': `Bearer ${publicAnonKey}` }
        }
      );
      tests.allEmployees = {
        status: serverTest.status,
        ok: serverTest.ok,
        data: serverTest.ok ? await serverTest.json() : await serverTest.text()
      };

      // Test 2: Test the manager route
      console.log('Testing manager route with ID:', managerId);
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/unified-employees/manager/${managerId}`;
      console.log('Full URL:', url);
      
      const managerTest = await fetch(url, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` }
      });
      
      console.log('Manager route status:', managerTest.status);
      
      const responseText = await managerTest.text();
      console.log('Manager route response:', responseText);
      
      tests.managerRoute = {
        url: url,
        status: managerTest.status,
        ok: managerTest.ok,
        data: responseText ? JSON.parse(responseText) : null
      };

      setResults(tests);
    } catch (error) {
      console.error('Route test error:', error);
      setResults({
        error: error instanceof Error ? error.message : String(error),
        tests
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Bug className="w-6 h-6 text-yellow-600" />
        <div>
          <h3 className="font-semibold text-gray-900">Route Debugger</h3>
          <p className="text-sm text-gray-600">Test if the manager route is working</p>
        </div>
      </div>

      <button
        onClick={testRoute}
        disabled={testing}
        className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {testing ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            Testing Routes...
          </>
        ) : (
          <>
            <Bug className="w-4 h-4" />
            Test Routes
          </>
        )}
      </button>

      {results && (
        <div className="mt-4 space-y-3">
          {results.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-800">
                <strong>Error:</strong> {results.error}
              </p>
            </div>
          )}

          {results.allEmployees && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                {results.allEmployees.ok ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="font-medium text-sm">
                  GET /unified-employees - {results.allEmployees.status}
                </span>
              </div>
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(results.allEmployees.data, null, 2)}
              </pre>
            </div>
          )}

          {results.managerRoute && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                {results.managerRoute.ok ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="font-medium text-sm">
                  GET /unified-employees/manager/{managerId} - {results.managerRoute.status}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-2">
                URL: {results.managerRoute.url}
              </div>
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32">
                {JSON.stringify(results.managerRoute.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

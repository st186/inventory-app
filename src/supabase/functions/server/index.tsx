import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Server version for debugging
console.log('=== Bhandar-IMS Server v1.1 Starting ===');
console.log('Timestamp:', new Date().toISOString());

app.use('*', cors());
app.use('*', logger(console.log));

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Middleware to verify user authentication
async function verifyUser(authHeader: string | null) {
  if (!authHeader) {
    return { error: 'Unauthorized', status: 401 };
  }
  
  const accessToken = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  
  if (error || !user?.id) {
    return { error: 'Unauthorized', status: 401 };
  }
  
  // Fetch the latest user data from Supabase to ensure we have current role
  try {
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user.id);
    if (!userError && userData?.user) {
      // Merge the fresh metadata into the user object
      return { 
        user: {
          ...user,
          user_metadata: userData.user.user_metadata
        }
      };
    }
  } catch (e) {
    console.log('Error fetching fresh user data:', e);
  }
  
  return { user };
}

// Signup route
app.post('/make-server-c2dd9b9d/auth/signup', async (c) => {
  try {
    const { email, password, name, role, employeeId } = await c.req.json();

    if (!email || !password || !role) {
      return c.json({ error: 'Email, password, and role are required' }, 400);
    }

    if (!['manager', 'cluster_head', 'employee'].includes(role)) {
      return c.json({ error: 'Invalid role. Must be manager, cluster_head, or employee' }, 400);
    }

    // For employees, employeeId is required
    if (role === 'employee' && !employeeId) {
      return c.json({ error: 'Employee ID is required for employee accounts' }, 400);
    }

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role, employeeId: employeeId || null },
      // Automatically confirm the user's email since an email server hasn't been configured
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    // If employee, link to existing employee record
    if (role === 'employee' && employeeId) {
      try {
        const employees = await kv.getByPrefix('employee:');
        const employee = employees.find((emp: any) => emp.employeeId === employeeId);
        
        if (employee) {
          // Update employee with email
          await kv.set(`employee:${employee.id}`, { ...employee, email });
        }
      } catch (err) {
        console.log('Error linking employee:', err);
      }
    }

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log('Server error during signup:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

// Get all inventory items for user
app.get('/make-server-c2dd9b9d/inventory', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const items = await kv.getByPrefix(`inventory:${userId}:`);
    
    return c.json({ inventory: items || [] });
  } catch (error) {
    console.log('Error fetching inventory:', error);
    return c.json({ error: 'Failed to fetch inventory' }, 500);
  }
});

// Add inventory item
app.post('/make-server-c2dd9b9d/inventory', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can add inventory items' }, 403);
    }

    const item = await c.req.json();
    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `inventory:${userId}:${itemId}`;
    
    const inventoryItem = {
      ...item,
      id: itemId,
      userId
    };

    await kv.set(key, inventoryItem);
    
    return c.json({ success: true, item: inventoryItem });
  } catch (error) {
    console.log('Error adding inventory item:', error);
    return c.json({ error: 'Failed to add inventory item' }, 500);
  }
});

// Update inventory item
app.put('/make-server-c2dd9b9d/inventory/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can update inventory items' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `inventory:${userId}:${itemId}`;
    const updates = await c.req.json();
    
    const inventoryItem = {
      ...updates,
      id: itemId,
      userId
    };

    await kv.set(key, inventoryItem);
    
    return c.json({ success: true, item: inventoryItem });
  } catch (error) {
    console.log('Error updating inventory item:', error);
    return c.json({ error: 'Failed to update inventory item' }, 500);
  }
});

// Delete inventory item
app.delete('/make-server-c2dd9b9d/inventory/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can delete inventory items' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `inventory:${userId}:${itemId}`;
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting inventory item:', error);
    return c.json({ error: 'Failed to delete inventory item' }, 500);
  }
});

// Get all overhead items for user
app.get('/make-server-c2dd9b9d/overheads', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const items = await kv.getByPrefix(`overhead:${userId}:`);
    
    return c.json({ overheads: items || [] });
  } catch (error) {
    console.log('Error fetching overheads:', error);
    return c.json({ error: 'Failed to fetch overheads' }, 500);
  }
});

// Add overhead item
app.post('/make-server-c2dd9b9d/overheads', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can add overhead items' }, 403);
    }

    const item = await c.req.json();
    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `overhead:${userId}:${itemId}`;
    
    const overheadItem = {
      ...item,
      id: itemId,
      userId
    };

    await kv.set(key, overheadItem);
    
    return c.json({ success: true, item: overheadItem });
  } catch (error) {
    console.log('Error adding overhead item:', error);
    return c.json({ error: 'Failed to add overhead item' }, 500);
  }
});

// Update overhead item
app.put('/make-server-c2dd9b9d/overheads/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can update overhead items' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `overhead:${userId}:${itemId}`;
    const updates = await c.req.json();
    
    const overheadItem = {
      ...updates,
      id: itemId,
      userId
    };

    await kv.set(key, overheadItem);
    
    return c.json({ success: true, item: overheadItem });
  } catch (error) {
    console.log('Error updating overhead item:', error);
    return c.json({ error: 'Failed to update overhead item' }, 500);
  }
});

// Delete overhead item
app.delete('/make-server-c2dd9b9d/overheads/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can delete overhead items' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `overhead:${userId}:${itemId}`;
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting overhead item:', error);
    return c.json({ error: 'Failed to delete overhead item' }, 500);
  }
});

// Get all sales data for user
app.get('/make-server-c2dd9b9d/sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    // Get all sales data (not scoped by userId since everyone needs to see all sales)
    const items = await kv.getByPrefix(`sales:`);
    
    return c.json({ sales: items || [] });
  } catch (error) {
    console.log('Error fetching sales data:', error);
    return c.json({ error: 'Failed to fetch sales data' }, 500);
  }
});

// Add sales data
app.post('/make-server-c2dd9b9d/sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    console.log('Sales add - Auth error:', authResult.error);
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const userEmail = authResult.user.email;
    const fullMetadata = authResult.user.user_metadata;
    const role = authResult.user.user_metadata?.role;
    
    // Extensive debug logging
    console.log('=== ADD SALES DEBUG ===');
    console.log('User ID:', userId);
    console.log('User Email:', userEmail);
    console.log('Full user_metadata:', JSON.stringify(fullMetadata, null, 2));
    console.log('Role from metadata:', role);
    console.log('Role type:', typeof role);
    console.log('Role === "manager":', role === 'manager');
    console.log('Role !== "manager":', role !== 'manager');
    console.log('======================');

    // Check if role exists at all
    if (!role) {
      console.log('ERROR: No role found in user metadata. User needs to be assigned a role.');
      return c.json({ 
        error: 'User role not configured. Please contact administrator.',
        debug: {
          userId,
          email: userEmail,
          metadata: fullMetadata
        }
      }, 403);
    }

    if (role !== 'manager') {
      console.log('ERROR: User role is not manager. Current role:', role);
      return c.json({ 
        error: `Only managers can add sales data. Your current role: ${role}`,
        debug: {
          currentRole: role,
          requiredRole: 'manager'
        }
      }, 403);
    }

    console.log('SUCCESS: Role check passed. Adding sales data...');

    const item = await c.req.json();
    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `sales:${userId}:${itemId}`;
    
    const salesItem = {
      ...item,
      id: itemId,
      userId,
      approvalRequired: true
    };

    await kv.set(key, salesItem);
    console.log('Sales data saved successfully:', itemId);
    
    return c.json({ success: true, item: salesItem });
  } catch (error) {
    console.log('EXCEPTION in add sales:', error);
    return c.json({ error: 'Failed to add sales data' }, 500);
  }
});

// Update sales data
app.put('/make-server-c2dd9b9d/sales/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can update sales data' }, 403);
    }

    const itemId = c.req.param('id');
    const updates = await c.req.json();
    
    // Find the sales item with this ID (look through all users' sales)
    const allSales = await kv.getByPrefix('sales:');
    const existingSale = allSales.find((s: any) => s.id === itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;
    
    const salesItem = {
      ...updates,
      id: itemId,
      userId: existingSale.userId
    };

    await kv.set(key, salesItem);
    
    return c.json({ success: true, item: salesItem });
  } catch (error) {
    console.log('Error updating sales data:', error);
    return c.json({ error: 'Failed to update sales data' }, 500);
  }
});

// Approve sales data (cluster head only)
app.post('/make-server-c2dd9b9d/sales/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve sales data' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the sales item with this ID (look through all users' sales)
    const allSales = await kv.getByPrefix('sales:');
    const existingSale = allSales.find((s: any) => s.id === itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    const approvedItem = {
      ...existingSale,
      approvalRequired: false,
      approvedBy: authResult.user.email,
      approvedAt: new Date().toISOString()
    };

    await kv.set(key, approvedItem);
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving sales data:', error);
    return c.json({ error: 'Failed to approve sales data' }, 500);
  }
});

// Clear all data for user (for testing purposes)
app.delete('/make-server-c2dd9b9d/clear-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    
    // Get all inventory items
    const inventoryItems = await kv.getByPrefix(`inventory:${userId}:`);
    for (const item of inventoryItems || []) {
      await kv.del(`inventory:${userId}:${item.id}`);
    }
    
    // Get all overhead items
    const overheadItems = await kv.getByPrefix(`overhead:${userId}:`);
    for (const item of overheadItems || []) {
      await kv.del(`overhead:${userId}:${item.id}`);
    }
    
    // Get all sales data
    const salesItems = await kv.getByPrefix(`sales:${userId}:`);
    for (const item of salesItems || []) {
      await kv.del(`sales:${userId}:${item.id}`);
    }
    
    return c.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    console.log('Error clearing data:', error);
    return c.json({ error: 'Failed to clear data' }, 500);
  }
});

// Health check
app.get('/make-server-c2dd9b9d/health', (c) => {
  return c.json({ status: 'ok' });
});

// Debug endpoint to check user metadata
app.get('/make-server-c2dd9b9d/debug/user', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  return c.json({
    userId: authResult.user.id,
    email: authResult.user.email,
    metadata: authResult.user.user_metadata,
    role: authResult.user.user_metadata?.role,
    app_metadata: authResult.user.app_metadata
  });
});

// Fix user role - updates the user's metadata to include the role
app.post('/make-server-c2dd9b9d/auth/fix-role', async (c) => {
  try {
    const { email, role } = await c.req.json();

    if (!email || !role) {
      return c.json({ error: 'Email and role are required' }, 400);
    }

    if (!['manager', 'cluster_head', 'employee'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    // Get user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Update user metadata
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          role
        }
      }
    );

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    return c.json({ success: true, message: `Role updated to ${role}. Please log out and log back in.` });
  } catch (error) {
    console.log('Error fixing role:', error);
    return c.json({ error: 'Failed to update role' }, 500);
  }
});

// Bulk create employee accounts
app.post('/make-server-c2dd9b9d/auth/create-employee-accounts', async (c) => {
  try {
    const { employees } = await c.req.json();

    if (!employees || !Array.isArray(employees)) {
      return c.json({ error: 'Employees array is required' }, 400);
    }

    const results = [];
    const errors = [];

    for (const emp of employees) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === emp.email);

        if (existingUser) {
          // Update existing user to ensure role is set
          const { data, error } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            {
              user_metadata: {
                name: emp.name,
                role: 'employee',
                employeeId: emp.employeeId
              }
            }
          );

          if (error) {
            errors.push({ email: emp.email, error: error.message, action: 'update' });
          } else {
            results.push({ 
              email: emp.email, 
              status: 'updated',
              message: 'Existing account updated with employee role'
            });

            // Update employee record with email (same as for new accounts)
            const allEmployees = await kv.getByPrefix('employee:');
            const employeeRecord = allEmployees.find((e: any) => e.employeeId === emp.employeeId);
            
            if (employeeRecord) {
              const employeeKey = `employee:${employeeRecord.id}`;
              await kv.set(employeeKey, { ...employeeRecord, email: emp.email });
            }
          }
        } else {
          // Create new user
          const { data, error } = await supabase.auth.admin.createUser({
            email: emp.email,
            password: emp.password,
            user_metadata: { 
              name: emp.name, 
              role: 'employee',
              employeeId: emp.employeeId
            },
            email_confirm: true
          });

          if (error) {
            errors.push({ email: emp.email, error: error.message, action: 'create' });
          } else {
            results.push({ 
              email: emp.email, 
              status: 'created',
              employeeId: emp.employeeId
            });

            // Update employee record with email
            // First, find the employee by employeeId
            const allEmployees = await kv.getByPrefix('employee:');
            const employeeRecord = allEmployees.find((e: any) => e.employeeId === emp.employeeId);
            
            if (employeeRecord) {
              const employeeKey = `employee:${employeeRecord.id}`;
              await kv.set(employeeKey, { ...employeeRecord, email: emp.email });
            }
          }
        }
      } catch (err) {
        errors.push({ 
          email: emp.email, 
          error: err instanceof Error ? err.message : String(err),
          action: 'process'
        });
      }
    }

    return c.json({ 
      success: true, 
      created: results.filter(r => r.status === 'created').length,
      updated: results.filter(r => r.status === 'updated').length,
      failed: errors.length,
      results,
      errors 
    });
  } catch (error) {
    console.log('Error creating employee accounts:', error);
    return c.json({ error: 'Failed to create employee accounts' }, 500);
  }
});

// Employee Management Routes
// Get all employees
app.get('/make-server-c2dd9b9d/employees', async (c) => {
  try {
    // Fetch from both old and new employee storage for backwards compatibility
    const [oldEmployees, unifiedEmployees] = await Promise.all([
      kv.getByPrefix('employee:'),
      kv.getByPrefix('unified-employee:')
    ]);
    
    // Normalize unified employees to have both id and employeeId, and type field
    const normalizedUnified = unifiedEmployees.map((emp: any) => ({
      ...emp,
      id: emp.id || emp.employeeId, // Use employeeId as id if id doesn't exist
      employeeId: emp.employeeId || emp.id, // Ensure employeeId exists
      type: emp.employmentType || emp.type // Map employmentType to type for payroll compatibility
    }));
    
    // Combine both arrays
    const allEmployees = [...oldEmployees, ...normalizedUnified];
    
    return c.json({ success: true, employees: allEmployees });
  } catch (error) {
    console.log('Error fetching employees:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Add employee
app.post('/make-server-c2dd9b9d/employees', async (c) => {
  try {
    const employee = await c.req.json();
    const key = `employee:${employee.id}`;
    
    await kv.set(key, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error adding employee:', error);
    return c.json({ error: 'Failed to add employee' }, 500);
  }
});

// Update employee
app.put('/make-server-c2dd9b9d/employees/:id', async (c) => {
  try {
    const employeeId = c.req.param('id');
    const updates = await c.req.json();
    
    console.log('Updating employee:', employeeId, JSON.stringify(updates));
    
    // Try both old and new key formats for backward compatibility
    let key = `employee:${employeeId}`;
    let existingEmployee = await kv.get(key);
    
    // If not found with old format, try unified format
    if (!existingEmployee) {
      console.log('Employee not found with old format, trying unified format');
      key = `unified-employee:${employeeId}`;
      existingEmployee = await kv.get(key);
    }
    
    if (!existingEmployee) {
      console.log('Employee not found with either format');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    console.log('Existing employee found:', JSON.stringify(existingEmployee));
    
    const updatedEmployee = {
      ...existingEmployee,
      ...updates,
      id: employeeId,
      employeeId: employeeId // Ensure employeeId is preserved
    };
    
    await kv.set(key, updatedEmployee);
    console.log('Employee updated successfully with key:', key);
    
    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Error updating employee:', error);
    return c.json({ error: 'Failed to update employee' }, 500);
  }
});

// Delete employee
app.delete('/make-server-c2dd9b9d/employees/:id', async (c) => {
  try {
    const employeeId = c.req.param('id');
    console.log('Deleting employee:', employeeId);
    
    // Try both old and new key formats for backward compatibility
    let key = `employee:${employeeId}`;
    let existingEmployee = await kv.get(key);
    
    // If not found with old format, try unified format
    if (!existingEmployee) {
      console.log('Employee not found with old format, trying unified format');
      key = `unified-employee:${employeeId}`;
      existingEmployee = await kv.get(key);
    }
    
    if (!existingEmployee) {
      console.log('Employee not found with either format');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    await kv.del(key);
    console.log('Employee deleted successfully with key:', key);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting employee:', error);
    return c.json({ error: 'Failed to delete employee' }, 500);
  }
});

// Payout Management Routes
// Get all payouts
app.get('/make-server-c2dd9b9d/payouts', async (c) => {
  try {
    const payouts = await kv.getByPrefix('payout:');
    return c.json({ success: true, payouts });
  } catch (error) {
    console.log('Error fetching payouts:', error);
    return c.json({ error: 'Failed to fetch payouts' }, 500);
  }
});

// Add payouts (batch)
app.post('/make-server-c2dd9b9d/payouts', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received payout request:', JSON.stringify(body));
    
    const { payouts } = body;
    
    if (!payouts) {
      console.log('Error: payouts field missing from request body');
      return c.json({ error: 'Payouts field is required' }, 400);
    }
    
    if (!Array.isArray(payouts)) {
      console.log('Error: payouts is not an array:', typeof payouts);
      return c.json({ error: 'Payouts must be an array' }, 400);
    }
    
    console.log(`Processing ${payouts.length} payouts`);
    
    // Build separate arrays for keys and values as required by mset
    const keys: string[] = [];
    const values: any[] = [];
    
    payouts.forEach((payout, index) => {
      console.log(`Payout ${index}:`, JSON.stringify(payout));
      const key = `payout:${payout.id}`;
      keys.push(key);
      values.push(payout);
    });
    
    console.log('Saving payouts to KV store...');
    await kv.mset(keys, values);
    console.log('Payouts saved successfully');
    
    return c.json({ success: true, payouts });
  } catch (error) {
    console.log('Error adding payouts:', error);
    console.log('Error details:', error instanceof Error ? error.message : String(error));
    console.log('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ error: 'Failed to add payouts', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Update payout
app.put('/make-server-c2dd9b9d/payouts/:id', async (c) => {
  try {
    const payoutId = c.req.param('id');
    const updates = await c.req.json();
    
    console.log('Updating payout:', payoutId, JSON.stringify(updates));
    
    const key = `payout:${payoutId}`;
    const existingPayout = await kv.get(key);
    
    if (!existingPayout) {
      return c.json({ error: 'Payout not found' }, 404);
    }
    
    const updatedPayout = {
      ...existingPayout,
      ...updates,
      id: payoutId
    };
    
    await kv.set(key, updatedPayout);
    console.log('Payout updated successfully');
    
    return c.json({ success: true, payout: updatedPayout });
  } catch (error) {
    console.log('Error updating payout:', error);
    return c.json({ error: 'Failed to update payout' }, 500);
  }
});

// Delete payout
app.delete('/make-server-c2dd9b9d/payouts/:id', async (c) => {
  try {
    const payoutId = c.req.param('id');
    console.log('Deleting payout:', payoutId);
    
    const key = `payout:${payoutId}`;
    await kv.del(key);
    console.log('Payout deleted successfully');
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting payout:', error);
    return c.json({ error: 'Failed to delete payout' }, 500);
  }
});

// Setup cluster head account (special endpoint for initial setup)
app.post('/make-server-c2dd9b9d/setup-cluster-head', async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    
    console.log('Setting up cluster head account for:', email);

    // Generate employee ID
    const allEmployees = await kv.getByPrefix('unified_employee:');
    const numbers = allEmployees
      .map((emp: any) => {
        const match = emp.employeeId?.match(/BM(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((num: number) => num > 0);
    
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const employeeId = `BM${nextNumber.toString().padStart(3, '0')}`;

    console.log('Generated employee ID:', employeeId);

    // Create user in Supabase Auth with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delete existing user and employee records if any
    console.log('Checking for existing user and employee records...');
    
    // Delete from Auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      console.log('Deleting existing auth user:', existingUser.id);
      await supabase.auth.admin.deleteUser(existingUser.id);
    }
    
    // Delete from KV store - find and delete any employee records with this email
    const allExistingEmployees = await kv.getByPrefix('unified_employee:');
    const employeeToDelete = allExistingEmployees.find((emp: any) => emp.email === email);
    
    if (employeeToDelete) {
      console.log('Deleting existing employee record:', employeeToDelete.employeeId);
      await kv.del(`unified_employee:${employeeToDelete.employeeId}`);
    }

    // Create new user
    console.log('Creating new user in auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since we don't have email server
      user_metadata: {
        role: 'cluster_head',
        employeeId: employeeId,
        name: name
      }
    });

    if (authError) {
      console.log('Auth error:', authError);
      return c.json({ error: authError.message }, 400);
    }

    console.log('User created in auth with ID:', authData.user.id);

    // Create employee record in KV store
    const employeeData = {
      id: authData.user.id,
      employeeId: employeeId,
      name: name,
      email: email,
      role: 'cluster_head',
      employmentType: 'fulltime',
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'active',
      createdBy: 'system',
      createdAt: new Date().toISOString()
    };

    const employeeKey = `unified_employee:${employeeId}`;
    await kv.set(employeeKey, employeeData);
    console.log('Employee record created in KV store');

    return c.json({ 
      success: true, 
      message: 'Cluster head account created successfully',
      employeeId: employeeId,
      email: email
    });
  } catch (error) {
    console.log('Error setting up cluster head:', error);
    return c.json({ 
      error: 'Failed to setup cluster head account',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ===== Item Sales Management =====

// Get all item sales data
app.get('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('Fetching item sales data...');
    const itemSales = await kv.getByPrefix('item-sales:');
    console.log(`Found ${itemSales.length} item sales entries`);
    return c.json({ itemSales });
  } catch (error) {
    console.log('Error fetching item sales:', error);
    return c.json({ error: 'Failed to fetch item sales data' }, 500);
  }
});

// Upload item sales data (merges with existing data)
app.post('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('=== Item Sales Upload Started ===');
    
    let body;
    try {
      const rawBody = await c.req.text();
      console.log('Raw request body length:', rawBody.length);
      body = JSON.parse(rawBody);
    } catch (jsonError) {
      console.log('JSON parsing error:', jsonError);
      return c.json({ 
        error: 'Invalid JSON in request body', 
        details: jsonError instanceof Error ? jsonError.message : String(jsonError) 
      }, 400);
    }
    
    console.log('Received item sales upload request');
    console.log('Body has keys:', Object.keys(body));
    
    const { salesData, period } = body;
    
    if (!salesData || !Array.isArray(salesData)) {
      console.log('Invalid sales data - not an array');
      return c.json({ error: 'Invalid sales data. Expected an array.' }, 400);
    }
    
    if (salesData.length === 0) {
      console.log('Empty sales data array');
      return c.json({ error: 'No sales data provided' }, 400);
    }
    
    console.log('Processing', salesData.length, 'item sales entries for period:', period);
    
    // Validate and sanitize each item
    const sanitizedData = salesData.map((item) => {
      // Ensure all fields are valid types and clean
      const sanitized = {
        itemName: String(item.itemName || 'Unknown').trim().substring(0, 100),
        quantity: Number(item.quantity) || 0,
        revenue: Number(item.revenue) || 0,
        date: String(item.date || new Date().toISOString().split('T')[0]),
        period: String(item.period || period || 'custom')
      };
      
      return sanitized;
    });
    
    console.log('First sanitized item:', sanitizedData[0]);
    
    // Build arrays for mset
    const keys: string[] = [];
    const values: any[] = [];
    
    sanitizedData.forEach((item) => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const id = `${timestamp}-${random}`;
      const key = `item-sales:${id}`;
      keys.push(key);
      values.push({
        id,
        itemName: item.itemName,
        quantity: item.quantity,
        revenue: item.revenue,
        date: item.date,
        period: item.period,
        uploadedAt: new Date().toISOString()
      });
    });
    
    console.log('Saving', keys.length, 'items to KV store...');
    await kv.mset(keys, values);
    console.log('Item sales saved successfully');
    
    return c.json({ success: true, count: sanitizedData.length });
  } catch (error) {
    console.log('=== Error uploading item sales ===');
    console.log('Error type:', error?.constructor?.name);
    console.log('Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.log('Error stack:', error.stack);
    }
    return c.json({ 
      error: 'Failed to upload item sales data', 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Delete all item sales data
app.delete('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('Clearing all item sales data...');
    const itemSales = await kv.getByPrefix('item-sales:');
    console.log(`Found ${itemSales.length} item sales entries to delete`);
    
    if (itemSales.length > 0) {
      const keys = itemSales.map((item: any) => `item-sales:${item.id}`);
      await kv.mdel(keys);
      console.log('All item sales data cleared successfully');
    }
    
    return c.json({ success: true, deletedCount: itemSales.length });
  } catch (error) {
    console.log('Error clearing item sales:', error);
    return c.json({ error: 'Failed to clear item sales data' }, 500);
  }
});

// ===== Attendance & Leave Management =====

// Helper function to calculate leave balance
function calculateLeaveBalance(joiningDate: string, usedLeaves: number): number {
  const joining = new Date(joiningDate);
  const now = new Date();
  
  // Normalize dates to start of month for accurate comparison
  const joiningMonthStart = new Date(joining.getFullYear(), joining.getMonth(), 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // If joining date is in the future, no leaves yet
  if (joining > now) {
    return 0;
  }
  
  // Calculate months from joining month to current month (inclusive)
  const startYear = joiningMonthStart.getFullYear();
  const startMonth = joiningMonthStart.getMonth();
  const currentYear = currentMonthStart.getFullYear();
  const currentMonth = currentMonthStart.getMonth();
  
  // Reset leaves on January 1st each year - only count months in current year
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  
  let monthsToCount = 0;
  
  if (joining.getFullYear() === now.getFullYear()) {
    // Joined this year - count from joining month to current month
    monthsToCount = (currentMonth - startMonth) + 1;
  } else if (joining < currentYearStart) {
    // Joined in previous years - only count months from Jan 1 of current year
    monthsToCount = currentMonth + 1; // Jan = 0, so add 1
  } else {
    // This shouldn't happen but just in case
    monthsToCount = 1;
  }
  
  // Total credited leaves = 4 leaves per month (only for current year)
  const totalCredited = monthsToCount * 4;
  
  // Available balance
  return Math.max(0, totalCredited - usedLeaves);
}

// Create employee account (by manager)
app.post('/make-server-c2dd9b9d/attendance/employees', async (c) => {
  try {
    const { name, dob, email, password, employeeId, managerId, aadharFront, aadharBack, joiningDate } = await c.req.json();
    
    if (!name || !email || !password || !employeeId || !managerId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        name, 
        role: 'employee', 
        employeeId,
        managerId,
        joiningDate: joiningDate || new Date().toISOString().split('T')[0]
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store employee details
    const employee = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      employeeId,
      name,
      dob,
      email,
      managerId,
      aadharFront,
      aadharBack,
      joiningDate: joiningDate || new Date().toISOString().split('T')[0],
      authUserId: authData.user.id,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(`attendance-employee:${employeeId}`, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error creating employee:', error);
    return c.json({ error: 'Failed to create employee' }, 500);
  }
});

// Get employees by manager
app.get('/make-server-c2dd9b9d/attendance/employees/manager/:managerId', async (c) => {
  try {
    const managerId = c.req.param('managerId');
    const allEmployees = await kv.getByPrefix('attendance-employee:');
    const employees = allEmployees.filter((emp: any) => emp.managerId === managerId);
    return c.json({ employees });
  } catch (error) {
    console.log('Error fetching employees:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Create manager account (by cluster head)
app.post('/make-server-c2dd9b9d/attendance/managers', async (c) => {
  try {
    const { name, email, password, clusterHeadId } = await c.req.json();
    
    if (!name || !email || !password || !clusterHeadId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const employeeId = `MGR${Date.now().toString().slice(-8)}`;
    
    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        name, 
        role: 'manager', 
        employeeId,
        clusterHeadId,
        joiningDate: new Date().toISOString().split('T')[0]
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store manager details
    const manager = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      employeeId,
      name,
      email,
      clusterHeadId,
      joiningDate: new Date().toISOString().split('T')[0],
      authUserId: authData.user.id,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(`attendance-manager:${employeeId}`, manager);
    
    return c.json({ success: true, manager, employeeId });
  } catch (error) {
    console.log('Error creating manager:', error);
    return c.json({ error: 'Failed to create manager' }, 500);
  }
});

// Get managers by cluster head
app.get('/make-server-c2dd9b9d/attendance/managers/cluster/:clusterHeadId', async (c) => {
  try {
    const clusterHeadId = c.req.param('clusterHeadId');
    const allManagers = await kv.getByPrefix('attendance-manager:');
    const managers = allManagers.filter((mgr: any) => mgr.clusterHeadId === clusterHeadId);
    return c.json({ managers });
  } catch (error) {
    console.log('Error fetching managers:', error);
    return c.json({ error: 'Failed to fetch managers' }, 500);
  }
});

// ===== Timesheet Management =====

// Get timesheets for an employee
app.get('/make-server-c2dd9b9d/timesheets/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const allTimesheets = await kv.getByPrefix(`timesheet:${employeeId}:`);
    return c.json({ timesheets: allTimesheets });
  } catch (error) {
    console.log('Error fetching timesheets:', error);
    return c.json({ error: 'Failed to fetch timesheets' }, 500);
  }
});

// Save single timesheet
app.post('/make-server-c2dd9b9d/timesheets', async (c) => {
  try {
    const timesheet = await c.req.json();
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
    
    await kv.set(key, {
      ...timesheet,
      id,
      submittedAt: new Date().toISOString()
    });
    
    return c.json({ success: true, id });
  } catch (error) {
    console.log('Error saving timesheet:', error);
    return c.json({ error: 'Failed to save timesheet' }, 500);
  }
});

// Save bulk timesheets
app.post('/make-server-c2dd9b9d/timesheets/bulk', async (c) => {
  try {
    const { timesheets } = await c.req.json();
    
    const keys: string[] = [];
    const values: any[] = [];
    
    for (const timesheet of timesheets) {
      const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
      keys.push(key);
      values.push({
        ...timesheet,
        id,
        submittedAt: new Date().toISOString()
      });
    }
    
    await kv.mset(keys, values);
    
    return c.json({ success: true, count: timesheets.length });
  } catch (error) {
    console.log('Error saving timesheets:', error);
    return c.json({ error: 'Failed to save timesheets' }, 500);
  }
});

// Approve timesheet
app.post('/make-server-c2dd9b9d/timesheets/:timesheetId/approve', async (c) => {
  try {
    const timesheetId = c.req.param('timesheetId');
    const { managerId } = await c.req.json();
    
    // Find the timesheet
    const allTimesheets = await kv.getByPrefix('timesheet:');
    const timesheet = allTimesheets.find((t: any) => t.id === timesheetId);
    
    if (!timesheet) {
      return c.json({ error: 'Timesheet not found' }, 404);
    }
    
    const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
    await kv.set(key, {
      ...timesheet,
      status: 'approved',
      approvedBy: managerId,
      approvedAt: new Date().toISOString()
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error approving timesheet:', error);
    return c.json({ error: 'Failed to approve timesheet' }, 500);
  }
});

// Reject timesheet
app.post('/make-server-c2dd9b9d/timesheets/:timesheetId/reject', async (c) => {
  try {
    const timesheetId = c.req.param('timesheetId');
    const { managerId, reason } = await c.req.json();
    
    // Find the timesheet
    const allTimesheets = await kv.getByPrefix('timesheet:');
    const timesheet = allTimesheets.find((t: any) => t.id === timesheetId);
    
    if (!timesheet) {
      return c.json({ error: 'Timesheet not found' }, 404);
    }
    
    const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
    await kv.set(key, {
      ...timesheet,
      status: 'rejected',
      rejectedBy: managerId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error rejecting timesheet:', error);
    return c.json({ error: 'Failed to reject timesheet' }, 500);
  }
});

// ===== Leave Management =====

// Get leaves for an employee
app.get('/make-server-c2dd9b9d/leaves/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const allLeaves = await kv.getByPrefix(`leave:${employeeId}:`);
    return c.json({ leaves: allLeaves });
  } catch (error) {
    console.log('Error fetching leaves:', error);
    return c.json({ error: 'Failed to fetch leaves' }, 500);
  }
});

// Get leave balance
app.get('/make-server-c2dd9b9d/leaves/:employeeId/balance', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const joiningDate = c.req.query('joiningDate') || new Date().toISOString().split('T')[0];
    
    // Get all approved leaves
    const allLeaves = await kv.getByPrefix(`leave:${employeeId}:`);
    const approvedLeaves = allLeaves.filter((l: any) => l.status === 'approved');
    
    const balance = calculateLeaveBalance(joiningDate, approvedLeaves.length);
    
    return c.json({ balance });
  } catch (error) {
    console.log('Error calculating leave balance:', error);
    return c.json({ error: 'Failed to calculate leave balance' }, 500);
  }
});

// Apply for leave
app.post('/make-server-c2dd9b9d/leaves', async (c) => {
  try {
    const leave = await c.req.json();
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `leave:${leave.employeeId}:${id}`;
    
    await kv.set(key, {
      ...leave,
      id,
      appliedAt: new Date().toISOString()
    });
    
    return c.json({ success: true, id });
  } catch (error) {
    console.log('Error applying leave:', error);
    return c.json({ error: 'Failed to apply leave' }, 500);
  }
});

// Approve leave
app.post('/make-server-c2dd9b9d/leaves/:leaveId/approve', async (c) => {
  try {
    const leaveId = c.req.param('leaveId');
    const { managerId, managerName } = await c.req.json();
    
    // Find the leave
    const allLeaves = await kv.getByPrefix('leave:');
    const leave = allLeaves.find((l: any) => l.id === leaveId);
    
    if (!leave) {
      return c.json({ error: 'Leave not found' }, 404);
    }
    
    const key = `leave:${leave.employeeId}:${leaveId}`;
    await kv.set(key, {
      ...leave,
      status: 'approved',
      approvedBy: managerName,
      approvedAt: new Date().toISOString()
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error approving leave:', error);
    return c.json({ error: 'Failed to approve leave' }, 500);
  }
});

// Reject leave
app.post('/make-server-c2dd9b9d/leaves/:leaveId/reject', async (c) => {
  try {
    const leaveId = c.req.param('leaveId');
    const { managerId, managerName, reason } = await c.req.json();
    
    // Find the leave
    const allLeaves = await kv.getByPrefix('leave:');
    const leave = allLeaves.find((l: any) => l.id === leaveId);
    
    if (!leave) {
      return c.json({ error: 'Leave not found' }, 404);
    }
    
    const key = `leave:${leave.employeeId}:${leaveId}`;
    await kv.set(key, {
      ...leave,
      status: 'rejected',
      rejectedBy: managerName,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    });
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error rejecting leave:', error);
    return c.json({ error: 'Failed to reject leave' }, 500);
  }
});

// ===== Unified Employee Management =====

// Get all unified employees
app.get('/make-server-c2dd9b9d/unified-employees', async (c) => {
  try {
    console.log('GET /unified-employees - Fetching all employees');
    const employees = await kv.getByPrefix('unified-employee:');
    console.log('GET /unified-employees - Found', employees.length, 'employees');
    console.log('GET /unified-employees - Sample employee structure:', employees[0] ? JSON.stringify(employees[0]) : 'none');
    return c.json({ employees });
  } catch (error) {
    console.log('Error fetching unified employees:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Get employees by manager (MUST BE BEFORE /:employeeId route)
app.get('/make-server-c2dd9b9d/unified-employees/manager/:managerId', async (c) => {
  try {
    const managerId = c.req.param('managerId');
    console.log('=== GET /unified-employees/manager/:managerId ROUTE HIT ===');
    console.log('Fetching employees for managerId:', managerId);
    console.log('Request path:', c.req.path);
    console.log('Request method:', c.req.method);
    
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Total unified employees found:', allEmployees.length);
    console.log('All employees:', JSON.stringify(allEmployees, null, 2));
    
    const employees = allEmployees.filter((emp: any) => emp.managerId === managerId);
    console.log('Filtered employees for manager:', employees.length);
    console.log('Filtered employees:', JSON.stringify(employees, null, 2));
    
    return c.json({ employees });
  } catch (error) {
    console.log('Error fetching employees by manager:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Get managers by cluster head (MUST BE BEFORE /:employeeId route)
app.get('/make-server-c2dd9b9d/unified-employees/cluster-head/:clusterHeadId', async (c) => {
  try {
    const clusterHeadId = c.req.param('clusterHeadId');
    const allEmployees = await kv.getByPrefix('unified-employee:');
    const managers = allEmployees.filter((emp: any) => emp.clusterHeadId === clusterHeadId && emp.role === 'manager');
    return c.json({ managers });
  } catch (error) {
    console.log('Error fetching managers by cluster head:', error);
    return c.json({ error: 'Failed to fetch managers' }, 500);
  }
});

// Create unified employee (Manager or Employee with unique ID BM001, BM002, etc.)
app.post('/make-server-c2dd9b9d/unified-employees', async (c) => {
  try {
    const employeeData = await c.req.json();
    
    if (!employeeData.employeeId || !employeeData.name || !employeeData.email || !employeeData.password) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Check if employee ID already exists
    const existing = await kv.get(`unified-employee:${employeeData.employeeId}`);
    if (existing) {
      return c.json({ error: 'Employee ID already exists' }, 400);
    }
    
    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: employeeData.email,
      password: employeeData.password,
      user_metadata: { 
        name: employeeData.name, 
        role: employeeData.role,
        employeeId: employeeData.employeeId,
        managerId: employeeData.managerId,
        clusterHeadId: employeeData.clusterHeadId,
        joiningDate: employeeData.joiningDate
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store unified employee details
    const employee = {
      ...employeeData,
      authUserId: authData.user.id,
      id: employeeData.employeeId // Use employeeId as the primary ID
    };
    
    delete employee.password; // Don't store password in KV
    
    await kv.set(`unified-employee:${employeeData.employeeId}`, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error creating unified employee:', error);
    return c.json({ error: 'Failed to create employee' }, 500);
  }
});

// Delete unified employee
app.delete('/make-server-c2dd9b9d/unified-employees/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    
    // Get employee to find auth user ID
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Delete from auth (optional - may want to keep for records)
    // if (employee.authUserId) {
    //   await supabase.auth.admin.deleteUser(employee.authUserId);
    // }
    
    // Delete from KV store
    await kv.del(`unified-employee:${employeeId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting unified employee:', error);
    return c.json({ error: 'Failed to delete employee' }, 500);
  }
});

// Assign manager to employee (MUST BE BEFORE generic /:employeeId route)
app.put('/make-server-c2dd9b9d/unified-employees/:employeeId/assign-manager', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can assign managers
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign managers to employees' }, 403);
    }

    const employeeId = c.req.param('employeeId');
    const { managerId } = await c.req.json();

    console.log(`Assigning manager ${managerId} to employee ${employeeId}`);

    // Get the employee record
    const employeeKey = `unified-employee:${employeeId}`;
    const employee = await kv.get(employeeKey);

    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Verify the manager exists and is a manager
    const managerKey = `unified-employee:${managerId}`;
    const manager = await kv.get(managerKey);

    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }

    if (manager.role !== 'manager') {
      return c.json({ error: 'The specified user is not a manager' }, 400);
    }

    // Verify the manager belongs to the same cluster head or was created by them
    const clusterHeadId = authResult.user.user_metadata?.employeeId;
    const clusterHeadEmail = authResult.user.email;
    
    console.log(`Checking manager assignment permissions:`, {
      managerId: manager.employeeId,
      managerName: manager.name,
      managerClusterHeadId: manager.clusterHeadId,
      managerCreatedBy: manager.createdBy,
      currentClusterHeadId: clusterHeadId,
      currentClusterHeadEmail: clusterHeadEmail
    });
    
    // Cluster heads can assign any manager within their organization
    // For simplicity in prototype, allow all managers to be assigned by any cluster head
    // In production, you'd want stricter validation based on organization structure
    console.log(`Cluster head ${clusterHeadEmail} is assigning manager ${manager.employeeId} - allowing assignment`);
    
    // Skip validation for now - cluster heads have full assignment rights
    // if (!isManagerUnderThisClusterHead) {
    //   console.log(`Assignment blocked - manager not under this cluster head's organization`);
    //   return c.json({ error: 'You can only assign managers from your organization' }, 403);
    // }

    // Update the employee with the new manager
    const updatedEmployee = {
      ...employee,
      managerId: managerId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(employeeKey, updatedEmployee);
    console.log(`Successfully assigned manager ${managerId} to employee ${employeeId}`);

    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Error assigning manager:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Update unified employee
app.put('/make-server-c2dd9b9d/unified-employees/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const updates = await c.req.json();
    
    console.log('Update unified employee - employeeId:', employeeId);
    console.log('Update unified employee - updates:', JSON.stringify(updates));
    
    // Debug: List all employee keys to check what exists
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Update unified employee - All employee IDs in system:', allEmployees.map((e: any) => e.employeeId || 'no-id'));
    
    // Get existing employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    console.log('Update unified employee - existing employee found:', employee ? 'yes' : 'no');
    
    if (!employee) {
      console.log('Update unified employee - ERROR: Employee not found');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Update employee details (preserve immutable fields)
    const updatedEmployee = {
      ...employee,
      ...updates,
      employeeId: employee.employeeId, // Don't allow changing ID
      authUserId: employee.authUserId, // Don't allow changing auth ID
      createdBy: employee.createdBy, // Don't allow changing creator
      createdAt: employee.createdAt, // Don't allow changing creation date
    };
    
    console.log('Update unified employee - updated employee data:', JSON.stringify(updatedEmployee));
    
    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, updatedEmployee);
    console.log('Update unified employee - KV store updated successfully');
    
    // Update auth metadata if email, name, or role changed
    if (employee.authUserId && (updates.email || updates.name || updates.role)) {
      try {
        console.log('Update unified employee - updating auth user:', employee.authUserId);
        await supabase.auth.admin.updateUserById(
          employee.authUserId,
          {
            email: updates.email || employee.email,
            user_metadata: {
              name: updates.name || employee.name,
              role: updates.role || employee.role,
              employeeId: employee.employeeId,
              managerId: updates.managerId || employee.managerId,
              clusterHeadId: updates.clusterHeadId || employee.clusterHeadId,
              joiningDate: updates.joiningDate || employee.joiningDate,
            }
          }
        );
        console.log('Update unified employee - auth user updated successfully');
      } catch (authError) {
        console.log('Update unified employee - ERROR updating auth user:', authError);
        // Continue even if auth update fails
      }
    }
    
    console.log('Update unified employee - SUCCESS');
    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Update unified employee - FATAL ERROR:', error);
    return c.json({ error: 'Failed to update employee', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Assign cluster head to manager
app.put('/make-server-c2dd9b9d/unified-employees/:managerId/assign-cluster-head', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const managerId = c.req.param('managerId');
    const { clusterHeadId } = await c.req.json();
    
    console.log('=== ASSIGN CLUSTER HEAD TO MANAGER ===');
    console.log('Manager ID:', managerId);
    console.log('Cluster Head ID:', clusterHeadId);
    
    // Get the manager
    const manager = await kv.get(`unified-employee:${managerId}`);
    
    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }
    
    if (manager.role !== 'manager') {
      return c.json({ error: 'Target employee is not a manager' }, 400);
    }
    
    // Verify cluster head exists and has correct role
    if (clusterHeadId) {
      const clusterHead = await kv.get(`unified-employee:${clusterHeadId}`);
      if (!clusterHead) {
        return c.json({ error: 'Cluster head not found' }, 404);
      }
      if (clusterHead.role !== 'cluster_head') {
        return c.json({ error: 'Assigned employee is not a cluster head' }, 400);
      }
    }
    
    // Update manager with cluster head assignment
    manager.clusterHeadId = clusterHeadId;
    await kv.set(`unified-employee:${managerId}`, manager);
    
    // Update auth metadata
    if (manager.authUserId) {
      try {
        await supabase.auth.admin.updateUserById(
          manager.authUserId,
          {
            user_metadata: {
              ...manager,
              clusterHeadId: clusterHeadId
            }
          }
        );
      } catch (authError) {
        console.log('Error updating auth metadata:', authError);
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Cluster head assigned successfully',
      manager 
    });
  } catch (error) {
    console.log('Error assigning cluster head:', error);
    return c.json({ error: 'Failed to assign cluster head' }, 500);
  }
});

// Get organizational hierarchy
app.get('/make-server-c2dd9b9d/organizational-hierarchy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    // Organize by role
    const clusterHeads = allEmployees.filter((emp: any) => emp.role === 'cluster_head');
    const managers = allEmployees.filter((emp: any) => emp.role === 'manager');
    const employees = allEmployees.filter((emp: any) => emp.role === 'employee');
    
    // Build hierarchy structure
    const hierarchy = clusterHeads.map((ch: any) => ({
      ...ch,
      managers: managers
        .filter((m: any) => m.clusterHeadId === ch.employeeId)
        .map((m: any) => ({
          ...m,
          employees: employees.filter((e: any) => e.managerId === m.employeeId)
        }))
    }));
    
    // Also include unassigned managers and employees
    const unassignedManagers = managers
      .filter((m: any) => !m.clusterHeadId)
      .map((m: any) => ({
        ...m,
        employees: employees.filter((e: any) => e.managerId === m.employeeId)
      }));
    
    const unassignedEmployees = employees.filter((e: any) => !e.managerId);
    
    return c.json({ 
      hierarchy,
      unassignedManagers,
      unassignedEmployees,
      stats: {
        totalClusterHeads: clusterHeads.length,
        totalManagers: managers.length,
        totalEmployees: employees.length
      }
    });
  } catch (error) {
    console.log('Error fetching organizational hierarchy:', error);
    return c.json({ error: 'Failed to fetch organizational hierarchy' }, 500);
  }
});

// Get all cluster heads
app.get('/make-server-c2dd9b9d/cluster-heads', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const allEmployees = await kv.getByPrefix('unified-employee:');
    const clusterHeads = allEmployees.filter((emp: any) => emp.role === 'cluster_head');
    return c.json({ clusterHeads });
  } catch (error) {
    console.log('Error fetching cluster heads:', error);
    return c.json({ error: 'Failed to fetch cluster heads' }, 500);
  }
});

// Delete cluster head by email (admin utility endpoint)
app.delete('/make-server-c2dd9b9d/cluster-heads/by-email/:email', async (c) => {
  try {
    const email = decodeURIComponent(c.req.param('email'));
    console.log('Deleting cluster head with email:', email);
    
    // Find and delete from Auth first
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const authUser = existingUsers?.users?.find((u: any) => u.email === email);
    
    if (authUser) {
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
        console.log('Deleted auth user:', authUser.id);
      } catch (authError) {
        console.log('Error deleting auth user:', authError);
      }
    }
    
    // Find the employee by email
    const allEmployees = await kv.getByPrefix('unified-employee:');
    const employee = allEmployees.find((emp: any) => emp.email === email);
    
    if (employee) {
      // Delete from KV store
      await kv.del(`unified-employee:${employee.employeeId}`);
      console.log('Deleted employee record:', employee.employeeId);
      return c.json({ success: true, deleted: employee });
    } else {
      console.log('No employee record found, but auth user may have been deleted');
      return c.json({ success: true, message: 'Deleted auth user if existed' });
    }
  } catch (error) {
    console.log('Error deleting cluster head by email:', error);
    return c.json({ error: 'Failed to delete cluster head' }, 500);
  }
});

// Catch-all 404 handler for debugging
app.notFound((c) => {
  console.log('=== 404 NOT FOUND ===');
  console.log('Path:', c.req.path);
  console.log('Method:', c.req.method);
  console.log('URL:', c.req.url);
  return c.json({ 
    error: 'Route not found',
    path: c.req.path,
    method: c.req.method,
    message: 'This route does not exist. Check the API documentation.'
  }, 404);
});

Deno.serve(app.fetch);
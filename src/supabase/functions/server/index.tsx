import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import inventoryItemsRoutes from './inventory-items.tsx';

const app = new Hono();

// Server version for debugging
console.log('=== Bhandar-IMS Server v1.3 - Dynamic Inventory Items ===');
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

    console.log('=== SIGNUP REQUEST ===');
    console.log('Email:', email);
    console.log('Role:', role);
    console.log('EmployeeId:', employeeId);

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
    console.log('Creating user with admin API...');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, employeeId: employeeId || null }
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    console.log('User created successfully:', data.user?.id);
    
    // IMPORTANT: Update the password to ensure it's properly set for signInWithPassword
    console.log('Setting password explicitly...');
    await supabase.auth.admin.updateUserById(data.user.id, {
      password: password
    });

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

// Quick setup endpoint for creating test cluster head (for development/testing)
// This endpoint handles everything: delete old account + create new account + create employee record
app.post('/make-server-c2dd9b9d/auth/setup-test-cluster-head', async (c) => {
  try {
    const testEmail = 'admin@bhandar.com';
    const testPassword = 'Admin@123';
    const testName = 'Test Cluster Head';
    const employeeId = 'BM001';
    
    // Step 1: Check if cluster head already exists and delete it
    try {
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(u => u.email === testEmail);
      
      if (existing) {
        // Delete existing user
        await supabase.auth.admin.deleteUser(existing.id);
        console.log('Deleted existing test cluster head');
        
        // Also delete the unified employee record
        try {
          await kv.del(`unified-employee:${employeeId}`);
          console.log('Deleted existing unified employee record');
        } catch (e) {
          console.log('No unified employee record to delete');
        }
      }
    } catch (e) {
      console.log('No existing user to delete');
    }

    // Step 2: Create the new account with admin API (bypasses email confirmation)
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      user_metadata: {
        name: testName,
        role: 'cluster_head',
        employeeId: employeeId
      },
      email_confirm: true // Auto-confirm email
    });

    if (createError) {
      console.log('Failed to create cluster head:', createError);
      return c.json({ error: createError.message }, 400);
    }

    console.log('Created cluster head auth account:', userData.user.id);

    // Step 3: Create unified employee record
    try {
      const employee = {
        employeeId: employeeId,
        name: testName,
        email: testEmail,
        role: 'cluster_head',
        employmentType: 'fulltime',
        joiningDate: new Date().toISOString().split('T')[0],
        createdBy: 'system',
        status: 'active',
        authUserId: userData.user.id,
        createdAt: new Date().toISOString()
      };
      
      await kv.set(`unified-employee:${employeeId}`, employee);
      console.log('Created unified employee record');
    } catch (err) {
      console.log('Error creating unified employee record:', err);
    }

    return c.json({
      success: true,
      message: 'Test cluster head created successfully!',
      credentials: {
        email: testEmail,
        password: testPassword,
        name: testName,
        role: 'cluster_head',
        employeeId: employeeId
      }
    });
  } catch (error) {
    console.log('Setup error:', error);
    return c.json({ error: 'Failed to setup test cluster head' }, 500);
  }
});

// Admin login endpoint - generates session token using admin privileges
// This bypasses password authentication for development/testing
app.post('/make-server-c2dd9b9d/auth/admin-login', async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Find user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Generate a magic link which includes access tokens
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: window?.location?.origin || 'http://localhost:3000'
      }
    });

    if (linkError) {
      console.log('Error generating login link:', linkError);
      return c.json({ error: linkError.message }, 400);
    }

    // Extract tokens from the properties
    const properties = linkData?.properties;
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      },
      session: properties
    });
  } catch (error) {
    console.log('Admin login error:', error);
    return c.json({ error: 'Failed to generate admin login' }, 500);
  }
});

// Delete ALL auth accounts - complete reset for fixing broken accounts
app.post('/make-server-c2dd9b9d/auth/reset-all-accounts', async (c) => {
  try {
    console.log('Deleting ALL auth accounts for fresh start...');
    
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const deleted = [];
    const errors = [];

    // Delete every single auth account
    for (const user of users.users) {
      try {
        await supabase.auth.admin.deleteUser(user.id);
        deleted.push(user.email);
        console.log(`Deleted: ${user.email}`);
      } catch (err) {
        errors.push({ email: user.email, error: String(err) });
      }
    }

    // Clear authUserId from all employee records
    try {
      const allEmployees = await kv.getByPrefix('employee:');
      for (const emp of allEmployees) {
        await kv.set(`employee:${emp.id}`, { ...emp, authUserId: null });
      }
      
      const unifiedEmployees = await kv.getByPrefix('unified-employee:');
      for (const emp of unifiedEmployees) {
        const key = `unified-employee:${emp.employeeId}`;
        await kv.set(key, { ...emp, authUserId: null });
      }
    } catch (err) {
      console.log('Error clearing employee auth IDs:', err);
    }

    return c.json({
      success: true,
      message: 'All auth accounts deleted. System reset complete.',
      deleted: deleted.length,
      deletedAccounts: deleted,
      errors: errors.length,
      errorDetails: errors
    });
  } catch (error) {
    console.log('Reset accounts error:', error);
    return c.json({ error: 'Failed to reset accounts' }, 500);
  }
});

// Server-side signup with email auto-confirm
app.post('/make-server-c2dd9b9d/auth/signup', async (c) => {
  try {
    const { email, password, name, role, employeeId } = await c.req.json();
    
    if (!email || !password || !name || !role) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Create user with admin API - this bypasses email confirmation
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        name,
        role,
        employeeId: role === 'cluster_head' ? 'BM001' : employeeId
      },
      email_confirm: true // Auto-confirm email since we don't have email server
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    return c.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        user_metadata: data.user.user_metadata
      }
    });
  } catch (error) {
    console.log('Server signup error:', error);
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
    // All users (cluster heads, employees, and managers) see all inventory
    // Filtering by storeId happens in the frontend
    const items = await kv.getByPrefix('inventory:');
    
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
    
    const storeId = authResult.user.user_metadata?.storeId;
    const userName = authResult.user.user_metadata?.name;
    const userEmail = authResult.user.email;
    const employeeId = authResult.user.user_metadata?.employeeId; // Employee ID like BM001
    
    const inventoryItem = {
      ...item,
      id: itemId,
      userId,
      storeId: storeId || null,
      createdBy: employeeId || userId, // Use employeeId if available, fallback to userId
      createdByName: userName,
      createdByEmail: userEmail
    };

    await kv.set(key, inventoryItem);
    
    // Notify cluster heads about inventory data entry
    const clusterHeads = await getAllClusterHeads();
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await createNotification(
          clusterHead.authUserId,
          'inventory_logged',
          'Inventory Data Logged',
          `${managerName} logged inventory data for ${item.date}`,
          itemId,
          item.date
        );
      }
    }
    
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
    // All users (cluster heads, employees, and managers) see all overheads
    // Filtering by storeId happens in the frontend
    const items = await kv.getByPrefix('overhead:');
    
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
    
    const storeId = authResult.user.user_metadata?.storeId;
    
    const overheadItem = {
      ...item,
      id: itemId,
      userId,
      storeId: storeId || null
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

// ========================================
// FIXED COST ROUTES
// ========================================

// Get all fixed costs for user
app.get('/make-server-c2dd9b9d/fixed-costs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    // All users (cluster heads, employees, and managers) see all fixed costs
    // Filtering by storeId happens in the frontend
    const items = await kv.getByPrefix('fixedcost:');
    
    return c.json({ fixedCosts: items || [] });
  } catch (error) {
    console.log('Error fetching fixed costs:', error);
    return c.json({ error: 'Failed to fetch fixed costs' }, 500);
  }
});

// Add fixed cost item
app.post('/make-server-c2dd9b9d/fixed-costs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;
    const storeId = authResult.user.user_metadata?.storeId;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can add fixed costs' }, 403);
    }

    const body = await c.req.json();
    const id = crypto.randomUUID();
    const key = `fixedcost:${userId}:${id}`;
    
    const fixedCostItem = {
      ...body,
      id,
      userId,
      storeId: storeId || null
    };

    await kv.set(key, fixedCostItem);
    
    return c.json({ success: true, item: fixedCostItem });
  } catch (error) {
    console.log('Error adding fixed cost item:', error);
    return c.json({ error: 'Failed to add fixed cost item' }, 500);
  }
});

// Update fixed cost item
app.put('/make-server-c2dd9b9d/fixed-costs/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can update fixed costs' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `fixedcost:${userId}:${itemId}`;
    const updates = await c.req.json();
    
    const fixedCostItem = {
      ...updates,
      id: itemId,
      userId
    };

    await kv.set(key, fixedCostItem);
    
    return c.json({ success: true, item: fixedCostItem });
  } catch (error) {
    console.log('Error updating fixed cost item:', error);
    return c.json({ error: 'Failed to update fixed cost item' }, 500);
  }
});

// Delete fixed cost item
app.delete('/make-server-c2dd9b9d/fixed-costs/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can delete fixed costs' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `fixedcost:${userId}:${itemId}`;
    
    await kv.del(key);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting fixed cost item:', error);
    return c.json({ error: 'Failed to delete fixed cost item' }, 500);
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
    const designation = authResult.user.user_metadata?.designation;
    
    // Extensive debug logging
    console.log('=== ADD SALES DEBUG ===');
    console.log('User ID:', userId);
    console.log('User Email:', userEmail);
    console.log('Full user_metadata:', JSON.stringify(fullMetadata, null, 2));
    console.log('Role from metadata:', role);
    console.log('Designation from metadata:', designation);
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

    // Allow managers and store incharge to add sales data
    const isManager = role === 'manager';
    const isStoreIncharge = role === 'employee' && designation === 'store_incharge';
    
    if (!isManager && !isStoreIncharge) {
      console.log('ERROR: User is not authorized. Current role:', role, 'Designation:', designation);
      return c.json({ 
        error: `Only managers and store incharge can add sales data. Your current role: ${role}`,
        debug: {
          currentRole: role,
          currentDesignation: designation,
          requiredRole: 'manager or store_incharge'
        }
      }, 403);
    }

    console.log('SUCCESS: Role check passed. Adding sales data...');

    const item = await c.req.json();
    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `sales:${userId}:${itemId}`;
    
    const storeId = authResult.user.user_metadata?.storeId;
    const userName = authResult.user.user_metadata?.name;
    const employeeId = authResult.user.user_metadata?.employeeId; // Employee ID like BM001
    // userEmail already declared at line 759
    
    const salesItem = {
      ...item,
      id: itemId,
      userId,
      storeId: storeId || null,
      approvalRequired: true,
      createdBy: employeeId || userId, // Use employeeId if available, fallback to userId
      createdByName: userName,
      createdByEmail: userEmail
    };

    await kv.set(key, salesItem);
    console.log('Sales data saved successfully:', itemId);
    
    // Notify cluster heads about sales data entry
    const clusterHeads = await getAllClusterHeads();
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await createNotification(
          clusterHead.authUserId,
          'sales_logged',
          'Sales Data Logged',
          `${managerName} logged sales data for ${item.date}`,
          itemId,
          item.date
        );
      }
    }
    
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
    const designation = authResult.user.user_metadata?.designation;

    // Allow managers and store incharge to update sales data
    const isManager = role === 'manager';
    const isStoreIncharge = role === 'employee' && designation === 'store_incharge';
    
    if (!isManager && !isStoreIncharge) {
      return c.json({ error: 'Only managers and store incharge can update sales data' }, 403);
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

// Request approval for high discrepancy (manager)
app.post('/make-server-c2dd9b9d/sales/:id/request-approval', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow managers and store incharge to request approval
    const isManager = role === 'manager';
    const isStoreIncharge = role === 'employee' && designation === 'store_incharge';
    
    if (!isManager && !isStoreIncharge) {
      return c.json({ error: 'Only managers and store incharge can request approval' }, 403);
    }

    const itemId = c.req.param('id');
    const { requestedCashInHand, requestedOffset } = await c.req.json();
    
    // Find the sales item with this ID
    const allSales = await kv.getByPrefix('sales:');
    const existingSale = allSales.find((s: any) => s.id === itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    const updatedItem = {
      ...existingSale,
      approvalRequested: true,
      approvalRequestedAt: new Date().toISOString(),
      requestedCashInHand,
      requestedOffset,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null
    };

    await kv.set(key, updatedItem);
    
    // Create notifications for all cluster heads
    const clusterHeads = await getAllClusterHeads();
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await createNotification(
          clusterHead.authUserId,
          'discrepancy_request',
          'Cash Discrepancy Approval Needed',
          `${managerName} requests approval for ₹${Math.abs(requestedOffset).toFixed(2)} discrepancy on ${existingSale.date}`,
          itemId,
          existingSale.date
        );
      }
    }
    
    return c.json({ success: true, item: updatedItem });
  } catch (error) {
    console.log('Error requesting approval:', error);
    return c.json({ error: 'Failed to request approval' }, 500);
  }
});

// Approve discrepancy request (cluster head only)
app.post('/make-server-c2dd9b9d/sales/:id/approve-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the sales item with this ID
    const allSales = await kv.getByPrefix('sales:');
    const existingSale = allSales.find((s: any) => s.id === itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    if (!existingSale.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    // Approve: Update actual cash to the requested amount
    const approvedItem = {
      ...existingSale,
      actualCashInHand: existingSale.requestedCashInHand,
      cashOffset: existingSale.requestedOffset,
      approvalRequired: false,
      approvalStatus: 'approved', // Explicitly set approval status
      approvedBy: authResult.user.email,
      approvedAt: new Date().toISOString(),
      approvalRequested: false,
      requestedCashInHand: null,
      requestedOffset: null
    };

    await kv.set(key, approvedItem);
    
    // Notify the manager who submitted the sale
    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await createNotification(
      existingSale.userId,
      'discrepancy_approved',
      'Discrepancy Approved ✓',
      `${clusterHeadName} approved your cash discrepancy of ₹${Math.abs(existingSale.requestedOffset).toFixed(2)} for ${existingSale.date}`,
      itemId,
      existingSale.date
    );
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving discrepancy:', error);
    return c.json({ error: 'Failed to approve discrepancy' }, 500);
  }
});

// Reject discrepancy request (cluster head only)
app.post('/make-server-c2dd9b9d/sales/:id/reject-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can reject discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    const { reason } = await c.req.json();
    
    // Find the sales item with this ID
    const allSales = await kv.getByPrefix('sales:');
    const existingSale = allSales.find((s: any) => s.id === itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    if (!existingSale.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    // Reject: Keep the old amount, mark as rejected
    const rejectedItem = {
      ...existingSale,
      approvalRequested: false,
      rejectedBy: authResult.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      requestedCashInHand: null,
      requestedOffset: null
    };

    await kv.set(key, rejectedItem);
    
    // Notify the manager who submitted the sale
    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await createNotification(
      existingSale.userId,
      'discrepancy_rejected',
      'Discrepancy Rejected ✗',
      `${clusterHeadName} rejected your cash discrepancy request for ${existingSale.date}. Reason: ${reason}. You must pay the difference.`,
      itemId,
      existingSale.date
    );
    
    return c.json({ success: true, item: rejectedItem });
  } catch (error) {
    console.log('Error rejecting discrepancy:', error);
    return c.json({ error: 'Failed to reject discrepancy' }, 500);
  }
});

// Approve sales data (cluster head and operations manager)
app.post('/make-server-c2dd9b9d/sales/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow cluster heads and operations managers (managers who are NOT store/production incharge)
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can approve sales data' }, 403);
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
      approvalStatus: 'approved', // Explicitly set approval status
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

// ===== PRODUCTION DATA ENDPOINTS =====

// Get all production data
app.get('/make-server-c2dd9b9d/production', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const allProduction = await kv.getByPrefix('production:');
    return c.json({ production: allProduction });
  } catch (error) {
    console.log('Error fetching production data:', error);
    return c.json({ error: 'Failed to fetch production data' }, 500);
  }
});

// Add production data
app.post('/make-server-c2dd9b9d/production', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const data = await c.req.json();
    const newItem = {
      ...data,
      id: crypto.randomUUID(),
      userId: authResult.user.id
    };

    const key = `production:${authResult.user.id}:${newItem.id}`;
    await kv.set(key, newItem);
    console.log('Production data saved successfully:', newItem.id);

    // Notify ONLY operations managers about production submission (Cluster Heads can only view, not approve)
    const operationsManagers = await getOperationsManagers(newItem.storeId);
    console.log('Found operations managers to notify:', operationsManagers.length, 'for storeId:', newItem.storeId);
    
    const productionHeadName = authResult.user.user_metadata?.name || data.createdBy || authResult.user.email;
    
    // Only Operations Managers can approve production data
    const approvers = operationsManagers;
    
    console.log('Total approvers to notify:', approvers.length);
    
    for (const approver of approvers) {
      if (approver.authUserId) {
        console.log('Creating notification for approver:', approver.email || approver.authUserId);
        await createNotification(
          approver.authUserId,
          'production_pending',
          'Production Data Awaiting Approval',
          `${productionHeadName} submitted production data for ${data.date}`,
          newItem.id,
          data.date
        );
        console.log('Notification created successfully');
      } else {
        console.log('Skipping approver without authUserId:', approver.email);
      }
    }

    return c.json({ success: true, item: newItem });
  } catch (error) {
    console.log('Error adding production data:', error);
    return c.json({ error: 'Failed to add production data' }, 500);
  }
});

// Update production data
app.put('/make-server-c2dd9b9d/production/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const itemId = c.req.param('id');
    const data = await c.req.json();

    const key = `production:${authResult.user.id}:${itemId}`;
    const updatedItem = {
      ...data,
      id: itemId,
      userId: authResult.user.id
    };

    await kv.set(key, updatedItem);

    return c.json({ success: true, item: updatedItem });
  } catch (error) {
    console.log('Error updating production data:', error);
    return c.json({ error: 'Failed to update production data' }, 500);
  }
});

// Approve production data
app.post('/make-server-c2dd9b9d/production/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow cluster heads and operations managers
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can approve production data' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the production item
    const allProduction = await kv.getByPrefix('production:');
    const existingProduction = allProduction.find((p: any) => p.id === itemId);
    
    if (!existingProduction) {
      return c.json({ error: 'Production data not found' }, 404);
    }
    
    const key = `production:${existingProduction.userId}:${itemId}`;

    const approverName = authResult.user.user_metadata?.name || authResult.user.email;
    const approvedItem = {
      ...existingProduction,
      approvalStatus: 'approved',
      approvedBy: approverName,
      approvedAt: new Date().toISOString()
    };

    await kv.set(key, approvedItem);
    console.log('Production data approved:', itemId);
    
    // Notify the production head who submitted the data
    if (existingProduction.userId) {
      console.log('Creating approval notification for production head:', existingProduction.userId);
      await createNotification(
        existingProduction.userId,
        'production_approved',
        'Production Data Approved',
        `Your production data for ${existingProduction.date} was approved by ${approverName}`,
        itemId,
        existingProduction.date
      );
      console.log('Approval notification created successfully');
    } else {
      console.log('No userId found for production data, skipping notification');
    }
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving production data:', error);
    return c.json({ error: 'Failed to approve production data' }, 500);
  }
});

// One-time migration: Create notifications for existing pending production entries
app.post('/make-server-c2dd9b9d/production/migrate-notifications', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    
    // Allow cluster heads and operations managers to run this
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can run this migration' }, 403);
    }

    // Get all pending production entries
    const allProduction = await kv.getByPrefix('production:');
    const pendingProduction = allProduction.filter((p: any) => p.approvalStatus === 'pending');
    
    console.log('Found pending production entries:', pendingProduction.length);
    
    let notificationsCreated = 0;
    
    for (const prod of pendingProduction) {
      console.log('Processing production entry:', prod.id, 'storeId:', prod.storeId);
      
      // Get approvers for this production entry
      // Get approvers for this production entry (only Operations Managers, not Cluster Heads)
      const operationsManagers = await getOperationsManagers(prod.storeId);
      console.log('Operations managers found:', operationsManagers.length, operationsManagers.map(m => ({ email: m.email, authUserId: m.authUserId, role: m.role, designation: m.designation })));
      
      // Only Operations Managers can approve production data
      const approvers = operationsManagers;
      
      console.log('Total approvers:', approvers.length);
      
      // Get production head name
      const productionHeadName = prod.createdBy || 'Production Head';
      
      // Create notifications for each approver
      for (const approver of approvers) {
        console.log('Checking approver:', approver.email, 'authUserId:', approver.authUserId);
        if (approver.authUserId) {
          await createNotification(
            approver.authUserId,
            'production_pending',
            'Production Data Awaiting Approval',
            `${productionHeadName} submitted production data for ${prod.date}`,
            prod.id,
            prod.date
          );
          notificationsCreated++;
          console.log('Notification created for:', approver.email);
        } else {
          console.log('Skipping approver without authUserId:', approver.email);
        }
      }
    }
    
    console.log('Migration complete. Notifications created:', notificationsCreated);
    
    return c.json({ 
      success: true, 
      message: `Created ${notificationsCreated} notifications for ${pendingProduction.length} pending production entries` 
    });
  } catch (error) {
    console.log('Error migrating production notifications:', error);
    return c.json({ error: 'Failed to migrate notifications' }, 500);
  }
});

// Cleanup duplicate entries in the database
app.post('/make-server-c2dd9b9d/cleanup-duplicates', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run cleanup
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can cleanup duplicates' }, 403);
    }

    let removedCount = 0;
    const details: any = {
      inventory: { before: 0, after: 0, removed: 0 },
      overheads: { before: 0, after: 0, removed: 0 },
      sales: { before: 0, after: 0, removed: 0 }
    };

    // Cleanup Inventory
    const allInventory = await kv.getByPrefix('inventory:');
    details.inventory.before = allInventory.length;
    
    const uniqueInventory = new Map();
    for (const item of allInventory) {
      if (!uniqueInventory.has(item.id)) {
        uniqueInventory.set(item.id, item);
      }
    }
    
    // Delete all inventory items
    for (const item of allInventory) {
      const key = `inventory:${item.userId}:${item.id}`;
      await kv.del(key);
    }
    
    // Re-save only unique items
    for (const [id, item] of uniqueInventory.entries()) {
      const key = `inventory:${item.userId}:${item.id}`;
      await kv.set(key, item);
    }
    
    details.inventory.after = uniqueInventory.size;
    details.inventory.removed = allInventory.length - uniqueInventory.size;
    removedCount += details.inventory.removed;

    // Cleanup Overheads
    const allOverheads = await kv.getByPrefix('overhead:');
    details.overheads.before = allOverheads.length;
    
    const uniqueOverheads = new Map();
    for (const item of allOverheads) {
      if (!uniqueOverheads.has(item.id)) {
        uniqueOverheads.set(item.id, item);
      }
    }
    
    // Delete all overhead items
    for (const item of allOverheads) {
      const key = `overhead:${item.userId}:${item.id}`;
      await kv.del(key);
    }
    
    // Re-save only unique items
    for (const [id, item] of uniqueOverheads.entries()) {
      const key = `overhead:${item.userId}:${item.id}`;
      await kv.set(key, item);
    }
    
    details.overheads.after = uniqueOverheads.size;
    details.overheads.removed = allOverheads.length - uniqueOverheads.size;
    removedCount += details.overheads.removed;

    // Cleanup Sales
    const allSales = await kv.getByPrefix('sales:');
    details.sales.before = allSales.length;
    
    const uniqueSales = new Map();
    for (const item of allSales) {
      if (!uniqueSales.has(item.id)) {
        uniqueSales.set(item.id, item);
      }
    }
    
    // Delete all sales items
    for (const item of allSales) {
      const key = `sales:${item.userId}:${item.id}`;
      await kv.del(key);
    }
    
    // Re-save only unique items
    for (const [id, item] of uniqueSales.entries()) {
      const key = `sales:${item.userId}:${item.id}`;
      await kv.set(key, item);
    }
    
    details.sales.after = uniqueSales.size;
    details.sales.removed = allSales.length - uniqueSales.size;
    removedCount += details.sales.removed;

    console.log('🧹 Cleanup completed:', details);
    
    return c.json({ 
      success: true, 
      removed: removedCount,
      details 
    });
  } catch (error) {
    console.log('Error cleaning up duplicates:', error);
    return c.json({ error: 'Failed to cleanup duplicates' }, 500);
  }
});

// Fix orphaned sales/inventory records with null storeId
app.post('/make-server-c2dd9b9d/fix-orphaned-store-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run this fix
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can fix orphaned data' }, 403);
    }

    const { targetStoreId, dataType, recordIds } = await c.req.json();
    
    if (!targetStoreId) {
      return c.json({ error: 'targetStoreId is required' }, 400);
    }

    let fixedCount = 0;
    const fixed: any[] = [];

    if (dataType === 'sales' || !dataType) {
      // Fix sales data with null storeId
      const allSales = await kv.getByPrefix('sales:');
      
      for (const sale of allSales) {
        // If recordIds provided, only fix those specific records
        if (recordIds && !recordIds.includes(sale.id)) {
          continue;
        }
        
        // Fix if storeId is null or undefined
        if (!sale.storeId) {
          const oldKey = `sales:${sale.userId}:${sale.id}`;
          
          // Update the record with the target storeId
          const updatedSale = { ...sale, storeId: targetStoreId };
          
          // Save with updated storeId
          await kv.set(oldKey, updatedSale);
          
          fixedCount++;
          fixed.push({
            type: 'sales',
            id: sale.id,
            date: sale.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    if (dataType === 'inventory' || !dataType) {
      // Fix inventory data with null storeId
      const allInventory = await kv.getByPrefix('inventory:');
      
      for (const item of allInventory) {
        if (recordIds && !recordIds.includes(item.id)) {
          continue;
        }
        
        if (!item.storeId) {
          const oldKey = `inventory:${item.userId}:${item.id}`;
          const updatedItem = { ...item, storeId: targetStoreId };
          await kv.set(oldKey, updatedItem);
          
          fixedCount++;
          fixed.push({
            type: 'inventory',
            id: item.id,
            date: item.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    if (dataType === 'overhead' || !dataType) {
      // Fix overhead data with null storeId
      const allOverheads = await kv.getByPrefix('overhead:');
      
      for (const item of allOverheads) {
        if (recordIds && !recordIds.includes(item.id)) {
          continue;
        }
        
        if (!item.storeId) {
          const oldKey = `overhead:${item.userId}:${item.id}`;
          const updatedItem = { ...item, storeId: targetStoreId };
          await kv.set(oldKey, updatedItem);
          
          fixedCount++;
          fixed.push({
            type: 'overhead',
            id: item.id,
            date: item.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    console.log(`🔧 Fixed ${fixedCount} orphaned records, assigned to store ${targetStoreId}`);
    
    return c.json({ 
      success: true, 
      fixedCount,
      fixed
    });
  } catch (error) {
    console.log('Error fixing orphaned store data:', error);
    return c.json({ error: 'Failed to fix orphaned data' }, 500);
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
          // DELETE existing user - it has broken password from admin API
          const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
          
          if (deleteError) {
            errors.push({ email: emp.email, error: deleteError.message, action: 'delete' });
            continue;  // Skip to next employee
          }
          
          console.log(`Deleted existing broken account for ${emp.email}`);
        }
        
        // NOW create account - but DON'T use admin API!
        // Instead, store credentials for employee to signup themselves
        {
          results.push({ 
            email: emp.email, 
            status: 'ready_for_signup',
            employeeId: emp.employeeId,
            message: 'Employee must complete signup at login page',
            credentials: {
              email: emp.email,
              password: emp.password
            }
          });

          // Update employee record with email and temp password
          const allEmployees = await kv.getByPrefix('employee:');
          const employeeRecord = allEmployees.find((e: any) => e.employeeId === emp.employeeId);
          
          if (employeeRecord) {
            const employeeKey = `employee:${employeeRecord.id}`;
            await kv.set(employeeKey, { 
              ...employeeRecord, 
              email: emp.email,
              tempPassword: emp.password,  // Store for employee to use
              authUserId: null
            });
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
      deleted: results.filter(r => r.status === 'ready_for_signup').length,
      message: 'Old accounts deleted. Employees must signup at the login page using their credentials.',
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

// Delete employee (Archive with employment history)
app.delete('/make-server-c2dd9b9d/employees/:id', async (c) => {
  try {
    const employeeId = c.req.param('id');
    console.log('Archiving employee:', employeeId);
    
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
    
    // Calculate total earnings from payouts
    const payouts = await kv.getByPrefix('payout:');
    const employeePayouts = payouts.filter((p: any) => p.employeeId === employeeId);
    const totalEarnings = employeePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    
    // Archive the employee with release information
    const archivedEmployee = {
      ...existingEmployee,
      isActive: false,
      releasedAt: new Date().toISOString(),
      totalEarnings,
      archivedFrom: key,
    };
    
    // Save to archived employees
    const archiveKey = `archived-employee:${employeeId}`;
    await kv.set(archiveKey, archivedEmployee);
    
    // Remove from active employees
    await kv.del(key);
    
    console.log('Employee archived successfully. Total earnings:', totalEarnings);
    
    return c.json({ success: true, archived: archivedEmployee });
  } catch (error) {
    console.log('Error archiving employee:', error);
    return c.json({ error: 'Failed to archive employee' }, 500);
  }
});

// Get all archived employees
app.get('/make-server-c2dd9b9d/archived-employees', async (c) => {
  try {
    const archivedEmployees = await kv.getByPrefix('archived-employee:');
    console.log('Fetched archived employees:', archivedEmployees.length);
    return c.json({ success: true, employees: archivedEmployees });
  } catch (error) {
    console.log('Error fetching archived employees:', error);
    return c.json({ error: 'Failed to fetch archived employees' }, 500);
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
  
  // Calculate months in current year only (leaves reset on Jan 1st each year)
  const startYear = joiningMonthStart.getFullYear();
  const startMonth = joiningMonthStart.getMonth();
  const currentYear = currentMonthStart.getFullYear();
  const currentMonth = currentMonthStart.getMonth();
  
  // Current year start date
  const currentYearStart = new Date(now.getFullYear(), 0, 1);
  
  let monthsToCount = 0;
  
  if (joining.getFullYear() === now.getFullYear()) {
    // Joined this year - count from joining month to current month (within this year)
    monthsToCount = (currentMonth - startMonth) + 1;
  } else if (joining < currentYearStart) {
    // Joined in previous years - only count months from Jan 1 of current year to now
    monthsToCount = currentMonth + 1; // Jan = 0, so add 1 (Jan=1, Feb=2, etc.)
  } else {
    // This shouldn't happen but just in case
    monthsToCount = 1;
  }
  
  // Total credited leaves = 3 leaves per month (within current year, carries forward monthly, resets yearly)
  const totalCredited = monthsToCount * 3;
  
  // Available balance (unused leaves carry forward within the year, but reset on Jan 1st)
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
    const { name, email, password, clusterHeadId, storeId } = await c.req.json();
    
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
        storeId: storeId || null,
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
      storeId: storeId || null,
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
    
    const savedTimesheet = {
      ...timesheet,
      id,
      submittedAt: new Date().toISOString()
    };
    
    await kv.set(key, savedTimesheet);
    
    // Notify cluster heads about pending timesheet
    if (timesheet.status === 'pending') {
      const clusterHeads = await getAllClusterHeads();
      const employees = await kv.getByPrefix('attendance-employee:');
      const employee = employees.find((e: any) => e.id === timesheet.employeeId);
      const employeeName = employee?.name || timesheet.employeeId;
      
      for (const clusterHead of clusterHeads) {
        if (clusterHead.authUserId) {
          await createNotification(
            clusterHead.authUserId,
            'timesheet_pending',
            'Timesheet Approval Needed',
            `${employeeName} submitted timesheet for ${timesheet.date}`,
            id,
            timesheet.date
          );
        }
      }
    }
    
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
    const approvedTimesheet = {
      ...timesheet,
      status: 'approved',
      approvedBy: managerId,
      approvedAt: new Date().toISOString()
    };
    await kv.set(key, approvedTimesheet);
    
    // Notify the employee
    const employees = await kv.getByPrefix('attendance-employee:');
    const employee = employees.find((e: any) => e.id === timesheet.employeeId);
    if (employee?.authUserId) {
      await createNotification(
        employee.authUserId,
        'timesheet_approved',
        'Timesheet Approved ��',
        `Your timesheet for ${timesheet.date} has been approved`,
        timesheetId,
        timesheet.date
      );
    }
    
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
    const rejectedTimesheet = {
      ...timesheet,
      status: 'rejected',
      rejectedBy: managerId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };
    await kv.set(key, rejectedTimesheet);
    
    // Notify the employee
    const employees = await kv.getByPrefix('attendance-employee:');
    const employee = employees.find((e: any) => e.id === timesheet.employeeId);
    if (employee?.authUserId) {
      await createNotification(
        employee.authUserId,
        'timesheet_rejected',
        'Timesheet Rejected ✗',
        `Your timesheet for ${timesheet.date} was rejected. Reason: ${reason}`,
        timesheetId,
        timesheet.date
      );
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error rejecting timesheet:', error);
    return c.json({ error: 'Failed to reject timesheet' }, 500);
  }
});

// ===== Leave Management =====

// Get all leaves (for cluster heads/managers)
app.get('/make-server-c2dd9b9d/leaves/all', async (c) => {
  try {
    const allLeaves = await kv.getByPrefix('leave:');
    return c.json({ leaves: allLeaves });
  } catch (error) {
    console.log('Error fetching all leaves:', error);
    return c.json({ error: 'Failed to fetch all leaves' }, 500);
  }
});

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
    
    const savedLeave = {
      ...leave,
      id,
      appliedAt: new Date().toISOString()
    };
    
    await kv.set(key, savedLeave);
    
    // Notify cluster heads about pending leave
    if (leave.status === 'pending') {
      const clusterHeads = await getAllClusterHeads();
      const employees = await kv.getByPrefix('attendance-employee:');
      const employee = employees.find((e: any) => e.id === leave.employeeId);
      const employeeName = employee?.name || leave.employeeId;
      
      for (const clusterHead of clusterHeads) {
        if (clusterHead.authUserId) {
          await createNotification(
            clusterHead.authUserId,
            'leave_pending',
            'Leave Approval Needed',
            `${employeeName} applied for leave from ${leave.startDate} to ${leave.endDate}`,
            id,
            leave.startDate
          );
        }
      }
    }
    
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
    const approvedLeave = {
      ...leave,
      status: 'approved',
      approvedBy: managerName,
      approvedAt: new Date().toISOString()
    };
    await kv.set(key, approvedLeave);
    
    // Notify the employee
    const employees = await kv.getByPrefix('attendance-employee:');
    const employee = employees.find((e: any) => e.id === leave.employeeId);
    if (employee?.authUserId) {
      await createNotification(
        employee.authUserId,
        'leave_approved',
        'Leave Approved ✓',
        `Your leave from ${leave.startDate} to ${leave.endDate} has been approved by ${managerName}`,
        leaveId,
        leave.startDate
      );
    }
    
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
    const rejectedLeave = {
      ...leave,
      status: 'rejected',
      rejectedBy: managerName,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };
    await kv.set(key, rejectedLeave);
    
    // Notify the employee
    const employees = await kv.getByPrefix('attendance-employee:');
    const employee = employees.find((e: any) => e.id === leave.employeeId);
    if (employee?.authUserId) {
      await createNotification(
        employee.authUserId,
        'leave_rejected',
        'Leave Rejected ✗',
        `Your leave from ${leave.startDate} to ${leave.endDate} was rejected by ${managerName}. Reason: ${reason}`,
        leaveId,
        leave.startDate
      );
    }
    
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
    console.log('=== GET /unified-employees/cluster-head/:clusterHeadId ROUTE HIT ===');
    console.log('Fetching managers for clusterHeadId:', clusterHeadId);
    
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Total unified employees found:', allEmployees.length);
    
    // Log all managers in the system
    const allManagers = allEmployees.filter((emp: any) => emp.role === 'manager');
    console.log('All managers in system:', allManagers.map((m: any) => ({
      id: m.employeeId,
      name: m.name,
      clusterHeadId: m.clusterHeadId,
      hasClusterHead: !!m.clusterHeadId
    })));
    
    const managers = allEmployees.filter((emp: any) => emp.clusterHeadId === clusterHeadId && emp.role === 'manager');
    console.log('Filtered managers for cluster head', clusterHeadId, ':', managers.length);
    console.log('Filtered managers:', managers.map((m: any) => ({
      id: m.employeeId,
      name: m.name,
      clusterHeadId: m.clusterHeadId
    })));
    
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

// Delete unified employee (Archive with employment history)
app.delete('/make-server-c2dd9b9d/unified-employees/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    
    // Get employee to find auth user ID
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Calculate total earnings from payouts
    const payouts = await kv.getByPrefix('payout:');
    const employeePayouts = payouts.filter((p: any) => p.employeeId === employeeId);
    const totalEarnings = employeePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    
    // Disable auth account instead of deleting
    if (employee.authUserId) {
      try {
        await supabase.auth.admin.updateUserById(employee.authUserId, {
          user_metadata: { 
            ...employee.user_metadata,
            isActive: false,
            archivedAt: new Date().toISOString()
          }
        });
      } catch (authError) {
        console.log('Warning: Could not update auth user metadata:', authError);
      }
    }
    
    // Archive the employee with release information
    const archivedEmployee = {
      ...employee,
      isActive: false,
      releasedAt: new Date().toISOString(),
      totalEarnings,
      joiningDate: employee.joiningDate || employee.createdAt,
    };
    
    // Save to archived employees
    await kv.set(`archived-employee:${employeeId}`, archivedEmployee);
    
    // Delete from active employees
    await kv.del(`unified-employee:${employeeId}`);
    
    console.log('Employee archived successfully. Total earnings:', totalEarnings);
    
    return c.json({ success: true, archived: archivedEmployee });
  } catch (error) {
    console.log('Error deleting unified employee:', error);
    return c.json({ error: 'Failed to delete employee' }, 500);
  }
});

// Reset employee password
app.post('/make-server-c2dd9b9d/unified-employees/:employeeId/reset-password', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const { newPassword } = await c.req.json();
    
    if (!newPassword) {
      return c.json({ error: 'New password is required' }, 400);
    }
    
    // Get employee to find auth user ID
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    let authUserId = employee.authUserId;
    let needsNewAccount = false;
    
    // If employee has an authUserId, verify the user still exists
    if (authUserId) {
      const { data: existingUser, error: getUserError } = await supabase.auth.admin.getUserById(authUserId);
      
      if (getUserError || !existingUser.user) {
        console.log(`Auth user ${authUserId} not found for employee ${employeeId}, will create new account`);
        needsNewAccount = true;
        authUserId = null;
      }
    } else {
      needsNewAccount = true;
    }
    
    // Create new auth account if needed
    if (needsNewAccount) {
      console.log(`Creating auth account for employee ${employeeId} during password reset`);
      
      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: employee.email,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role
        }
      });
      
      if (createError || !authData.user) {
        console.log('Error creating auth account during password reset:', createError);
        return c.json({ error: 'Failed to create auth account: ' + (createError?.message || 'Unknown error') }, 500);
      }
      
      authUserId = authData.user.id;
      
      // Update employee with auth user ID
      employee.authUserId = authUserId;
      await kv.set(`unified-employee:${employeeId}`, employee);
      
      console.log(`Auth account created for employee ${employeeId}: ${authUserId}`);
    } else {
      // Update existing auth account password
      const { error } = await supabase.auth.admin.updateUserById(
        authUserId,
        { password: newPassword }
      );
      
      if (error) {
        console.log('Error resetting password:', error);
        return c.json({ error: error.message }, 400);
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Password reset successfully',
      credentials: {
        email: employee.email,
        password: newPassword,
        employeeId: employee.employeeId
      }
    });
  } catch (error) {
    console.log('Error resetting employee password:', error);
    return c.json({ error: 'Failed to reset password' }, 500);
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
    
    // Update auth metadata if email, name, role, designation, department, or storeId changed
    if (employee.authUserId && (updates.email || updates.name || updates.role || updates.designation !== undefined || updates.department !== undefined || updates.storeId !== undefined)) {
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
              designation: updates.designation !== undefined ? updates.designation : employee.designation,
              department: updates.department !== undefined ? updates.department : employee.department,
              storeId: updates.storeId !== undefined ? updates.storeId : employee.storeId,
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
    const storeId = c.req.query('storeId');
    let allEmployees = await kv.getByPrefix('unified-employee:');
    
    console.log(`[Hierarchy] Total employees before filtering: ${allEmployees.length}`);
    console.log(`[Hierarchy] Requested storeId: ${storeId || 'ALL'}`);
    
    // Filter by store if specified
    // IMPORTANT: Also include employees without a storeId (newly created employees)
    if (storeId) {
      allEmployees = allEmployees.filter((emp: any) => emp.storeId === storeId || !emp.storeId);
      console.log(`[Hierarchy] Employees after store filter (including unassigned): ${allEmployees.length}`);
    }
    
    // Organize by role
    const clusterHeads = allEmployees.filter((emp: any) => emp.role === 'cluster_head');
    const managers = allEmployees.filter((emp: any) => emp.role === 'manager');
    const employees = allEmployees.filter((emp: any) => emp.role === 'employee');
    
    console.log(`[Hierarchy] Breakdown - Cluster Heads: ${clusterHeads.length}, Managers: ${managers.length}, Employees: ${employees.length}`);
    
    // Helper function to recursively build manager hierarchy
    const buildManagerHierarchy = (managerId: string, allManagers: any[], allEmployees: any[]): any => {
      // Get subordinate managers (managers who report to this manager)
      const subordinateManagers = allManagers.filter((m: any) => m.managerId === managerId);
      
      // Get direct employees (non-managers) under this manager
      const directEmployees = allEmployees.filter((e: any) => e.managerId === managerId);
      
      // Recursively build subordinate manager hierarchies
      const managersWithHierarchy = subordinateManagers.map((subMgr: any) => {
        const subHierarchy = buildManagerHierarchy(subMgr.employeeId, allManagers, allEmployees);
        return {
          ...subMgr,
          managers: subHierarchy.managers,
          employees: subHierarchy.employees
        };
      });
      
      return {
        managers: managersWithHierarchy,
        employees: directEmployees
      };
    };
    
    // Build hierarchy structure with multi-level manager support
    const hierarchy = clusterHeads.map((ch: any) => {
      // Get top-level managers (those directly reporting to cluster head)
      // This includes managers with managerId === cluster head ID OR (no managerId AND clusterHeadId === cluster head ID)
      const topLevelManagers = managers.filter((m: any) => 
        m.clusterHeadId === ch.employeeId && (!m.managerId || m.managerId === ch.employeeId)
      );
      
      // Build each top-level manager's hierarchy recursively
      const managersWithHierarchy = topLevelManagers.map((m: any) => {
        const hierarchy = buildManagerHierarchy(m.employeeId, managers, employees);
        return {
          ...m,
          managers: hierarchy.managers,
          employees: hierarchy.employees
        };
      });
      
      return {
        ...ch,
        managers: managersWithHierarchy
      };
    });
    
    // Also include unassigned managers and employees (managers without cluster head OR manager assignment)
    const unassignedManagers = managers
      .filter((m: any) => !m.clusterHeadId && !m.managerId)  // Only show if BOTH are missing
      .map((m: any) => {
        const hierarchy = buildManagerHierarchy(m.employeeId, managers, employees);
        return {
          ...m,
          managers: hierarchy.managers,
          employees: hierarchy.employees
        };
      });
    
    console.log('[Hierarchy Debug] Manager filtering:', {
      totalManagers: managers.length,
      managersWithClusterHead: managers.filter((m: any) => m.clusterHeadId).map((m: any) => `${m.employeeId} (CH: ${m.clusterHeadId})`),
      managersWithManagerId: managers.filter((m: any) => m.managerId).map((m: any) => `${m.employeeId} (MGR: ${m.managerId})`),
      unassignedCount: unassignedManagers.length,
      unassigned: unassignedManagers.map((m: any) => m.employeeId)
    });
    
    const unassignedEmployees = employees.filter((e: any) => !e.managerId && !e.inchargeId);
    
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

// Migration utility: Assign storeIds to employees based on their manager's store
app.post('/make-server-c2dd9b9d/migrate-employee-stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can run migrations
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can run migrations' }, 403);
  }

  try {
    console.log('Starting employee store migration...');
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let needsManualAssignment = 0;
    const updates = [];
    const manualAssignmentNeeded = [];
    const errorDetails = [];

    for (const employee of allEmployees) {
      // Skip if already has storeId
      if (employee.storeId) {
        skipped++;
        continue;
      }

      // Skip cluster heads - they don't belong to a specific store
      if (employee.role === 'cluster_head') {
        skipped++;
        continue;
      }

      // For managers without storeId, they need manual assignment via store management
      if (employee.role === 'manager') {
        console.log(`Manager ${employee.employeeId} (${employee.name}) needs storeId assigned via store management`);
        needsManualAssignment++;
        manualAssignmentNeeded.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: 'Manager needs store assignment via Store Management'
        });
        continue;
      }

      // For employees (or any role that's not manager/cluster_head), get storeId from their manager
      const isNonManagerRole = employee.role !== 'manager' && employee.role !== 'cluster_head';
      
      if (isNonManagerRole && employee.managerId) {
        const manager = await kv.get(`unified-employee:${employee.managerId}`);
        if (manager && manager.storeId) {
          employee.storeId = manager.storeId;
          await kv.set(`unified-employee:${employee.employeeId}`, employee);
          updates.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            assignedStoreId: manager.storeId
          });
          updated++;
          console.log(`Assigned storeId ${manager.storeId} to employee ${employee.employeeId} (${employee.name}) with role ${employee.role}`);
        } else if (manager && !manager.storeId) {
          console.log(`Cannot assign storeId to employee ${employee.employeeId} - manager ${employee.managerId} has no storeId`);
          needsManualAssignment++;
          manualAssignmentNeeded.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            managerId: employee.managerId,
            managerName: manager.name,
            reason: `Manager ${manager.name} needs store assignment first`
          });
        } else {
          console.log(`Cannot find manager ${employee.managerId} for employee ${employee.employeeId}`);
          errors++;
          errorDetails.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            reason: `Manager ID ${employee.managerId} not found`
          });
        }
      } else if (isNonManagerRole && !employee.managerId) {
        console.log(`Employee ${employee.employeeId} (role: ${employee.role}) has no managerId assigned`);
        needsManualAssignment++;
        manualAssignmentNeeded.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: 'No manager assigned - needs manual assignment'
        });
      } else if (!isNonManagerRole && employee.role !== 'manager' && employee.role !== 'cluster_head') {
        // This case should never happen now, but keep for safety
        console.log(`Skipping ${employee.employeeId} - unexpected role: ${employee.role}`);
        errors++;
        errorDetails.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: `Unexpected role: ${employee.role}`
        });
      }
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} skipped, ${needsManualAssignment} need manual assignment, ${errors} errors`);

    return c.json({
      success: true,
      summary: {
        total: allEmployees.length,
        updated,
        skipped,
        needsManualAssignment,
        errors
      },
      updates,
      manualAssignmentNeeded,
      errorDetails
    });
  } catch (error) {
    console.log('Error running employee store migration:', error);
    return c.json({ error: 'Failed to run migration' }, 500);
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

// Assign manager to employee (updates managerId and storeId to match manager's store)
app.post('/make-server-c2dd9b9d/assign-manager-to-employee', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can assign managers
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can assign managers' }, 403);
  }

  try {
    const { employeeId, managerId } = await c.req.json();
    
    if (!employeeId || !managerId) {
      return c.json({ error: 'Employee ID and Manager ID are required' }, 400);
    }

    console.log(`Assigning manager ${managerId} to employee ${employeeId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Get the manager (can be a manager or cluster head)
    const manager = await kv.get(`unified-employee:${managerId}`);
    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }

    // Allow assigning to both managers and cluster heads (for multi-level hierarchy)
    if (manager.role !== 'manager' && manager.role !== 'cluster_head') {
      return c.json({ error: 'Selected user must be a manager or cluster head' }, 400);
    }

    // Update employee's managerId and storeId to match manager's store
    employee.managerId = managerId;
    if (manager.storeId) {
      employee.storeId = manager.storeId;
    }

    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Successfully assigned manager ${managerId} to employee ${employeeId}, storeId: ${employee.storeId || 'none'}`);

    return c.json({
      success: true,
      employee
    });
  } catch (error) {
    console.log('Error assigning manager to employee:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Update employee role (for fixing custom roles)
app.put('/make-server-c2dd9b9d/employee/:employeeId/role', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can update roles
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can update employee roles' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { newRole } = await c.req.json();
    
    if (!newRole || !['employee', 'manager', 'cluster_head'].includes(newRole)) {
      return c.json({ error: 'Invalid role. Must be: employee, manager, or cluster_head' }, 400);
    }

    console.log(`Updating role for ${employeeId} to ${newRole}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    const oldRole = employee.role;
    employee.role = newRole;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    // Update in Supabase Auth metadata
    if (employee.authUserId) {
      await supabase.auth.admin.updateUserById(employee.authUserId, {
        user_metadata: {
          ...authResult.user.user_metadata,
          role: newRole
        }
      });
    }

    console.log(`Successfully updated role for ${employeeId} from ${oldRole} to ${newRole}`);

    return c.json({
      success: true,
      employee,
      message: `Role updated from ${oldRole} to ${newRole}`
    });
  } catch (error) {
    console.log('Error updating employee role:', error);
    return c.json({ error: 'Failed to update role' }, 500);
  }
});

// Update employee store assignment
app.put('/make-server-c2dd9b9d/employee/:employeeId/store', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can reassign stores
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can reassign employee stores' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { newStoreId } = await c.req.json();
    
    if (!newStoreId) {
      return c.json({ error: 'Store ID is required' }, 400);
    }

    console.log(`Reassigning employee ${employeeId} to store ${newStoreId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Verify the store exists
    const store = await kv.get(`store:${newStoreId}`);
    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    const oldStoreId = employee.storeId || 'none';
    
    // If this is a store incharge, check if they're the only one for their current store
    if (employee.designation === 'store_incharge' && oldStoreId !== 'none' && oldStoreId !== newStoreId) {
      // Get all employees
      const allEmployees = await kv.getByPrefix('unified-employee:');
      
      // Count store incharges in the old store (excluding current employee)
      const storeInchargesInOldStore = allEmployees.filter((emp: any) => 
        emp.storeId === oldStoreId && 
        emp.designation === 'store_incharge' && 
        emp.employeeId !== employeeId
      );
      
      if (storeInchargesInOldStore.length === 0) {
        return c.json({ 
          error: `Cannot reassign this Store Incharge to another store. This is the only Store Incharge for store ${oldStoreId}. Each store must have at least one Store Incharge. Please assign another Store Incharge for store ${oldStoreId} before reassigning this employee.` 
        }, 400);
      }
    }
    
    employee.storeId = newStoreId;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Successfully reassigned employee ${employeeId} from store ${oldStoreId} to ${newStoreId}`);

    return c.json({
      success: true,
      employee,
      message: `Store updated from ${oldStoreId} to ${newStoreId}`,
      oldStoreId,
      newStoreId
    });
  } catch (error) {
    console.log('Error updating employee store:', error);
    return c.json({ error: 'Failed to update store' }, 500);
  }
});

// Update employee designation (Store Incharge / Production Incharge)
app.put('/make-server-c2dd9b9d/employee/:employeeId/designation', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads and operations managers can assign designations
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head' && role !== 'manager') {
    return c.json({ error: 'Only cluster heads and operations managers can assign designations' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { designation, department } = await c.req.json();
    
    console.log(`Updating designation for employee ${employeeId}: designation: ${designation}, department: ${department}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Only regular employees (role: 'employee') can be assigned as incharges
    if (employee.role !== 'employee') {
      return c.json({ error: 'Only regular employees can be assigned as Store Incharge or Production Incharge' }, 400);
    }

    const oldDesignation = employee.designation;
    const oldDepartment = employee.department;

    // If removing Store Incharge designation, check if this is the only store incharge for this store
    if (oldDesignation === 'store_incharge' && designation !== 'store_incharge' && employee.storeId) {
      // Get all employees
      const allEmployees = await kv.getByPrefix('unified-employee:');
      
      // Count store incharges in this store (excluding current employee)
      const storeInchargesInStore = allEmployees.filter((emp: any) => 
        emp.storeId === employee.storeId && 
        emp.designation === 'store_incharge' && 
        emp.employeeId !== employeeId
      );
      
      if (storeInchargesInStore.length === 0) {
        return c.json({ 
          error: `Cannot remove Store Incharge designation. This is the only Store Incharge for store ${employee.storeId}. Each store must have at least one Store Incharge. Please assign another Store Incharge for this store before removing this designation.` 
        }, 400);
      }
    }

    // Update designation and department
    employee.designation = designation;
    employee.department = department;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    // IMPORTANT: Also update the auth user's metadata so designation is available in the session
    if (employee.authUserId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );

        await supabaseAdmin.auth.admin.updateUserById(
          employee.authUserId,
          {
            user_metadata: {
              designation: designation,
              department: department
            }
          }
        );
        
        console.log(`Successfully updated auth user metadata for ${employee.authUserId} with designation: ${designation}`);
      } catch (authError) {
        console.error('Error updating auth user metadata:', authError);
        // Don't fail the whole operation if auth update fails
      }
    }

    console.log(`Successfully updated designation for employee ${employeeId}`);

    return c.json({
      success: true,
      employee,
      message: 'Designation updated successfully',
      oldDesignation,
      oldDepartment,
      newDesignation: designation,
      newDepartment: department
    });
  } catch (error) {
    console.log('Error updating employee designation:', error);
    return c.json({ error: 'Failed to update designation' }, 500);
  }
});

// Sync all employee designations to auth metadata (one-time fix)
app.post('/make-server-c2dd9b9d/sync-designations', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can run this sync
  const role = authResult.user.user_metadata?.role;
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can sync designations' }, 403);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Get all employees
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const employee of allEmployees) {
      // Only sync if employee has an authUserId and a designation
      if (employee.authUserId && employee.designation) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(
            employee.authUserId,
            {
              user_metadata: {
                designation: employee.designation,
                department: employee.department || null
              }
            }
          );
          synced++;
          console.log(`Synced designation for ${employee.employeeId}: ${employee.designation}`);
        } catch (authError) {
          console.error(`Error syncing ${employee.employeeId}:`, authError);
          errors.push({ employeeId: employee.employeeId, error: String(authError) });
        }
      } else {
        skipped++;
      }
    }

    return c.json({
      success: true,
      message: 'Designation sync completed',
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.log('Error syncing designations:', error);
    return c.json({ error: 'Failed to sync designations' }, 500);
  }
});

// Get employees by incharge ID
app.get('/make-server-c2dd9b9d/employees/by-incharge/:inchargeId', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const inchargeId = c.req.param('inchargeId');
    
    console.log(`Fetching employees for incharge: ${inchargeId}`);

    // Get all employees
    const employeeKeys = await kv.getByPrefix('unified-employee:');
    
    // Filter employees where inchargeId matches
    const employees = employeeKeys
      .filter((emp: any) => emp.inchargeId === inchargeId && emp.role === 'employee')
      .map((emp: any) => ({
        id: emp.id,
        employeeId: emp.employeeId,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        type: emp.type,
        joiningDate: emp.joiningDate,
        storeId: emp.storeId,
        inchargeId: emp.inchargeId,
        department: emp.department
      }));

    console.log(`Found ${employees.length} employees under incharge ${inchargeId}`);

    return c.json(employees);
  } catch (error) {
    console.log('Error fetching employees by incharge:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Assign incharge to employee
app.put('/make-server-c2dd9b9d/employee/:employeeId/assign-incharge', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads and operations managers can assign incharges
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head' && role !== 'manager') {
    return c.json({ error: 'Only cluster heads and operations managers can assign employees to incharges' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { inchargeId } = await c.req.json();
    
    console.log(`Assigning employee ${employeeId} to incharge ${inchargeId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Get the incharge
    const incharge = await kv.get(`unified-employee:${inchargeId}`);
    if (!incharge) {
      return c.json({ error: 'Incharge not found' }, 404);
    }

    // Verify the incharge has a valid designation
    if (!incharge.designation || (incharge.designation !== 'store_incharge' && incharge.designation !== 'production_incharge')) {
      return c.json({ error: 'Selected employee is not an incharge' }, 400);
    }

    const oldInchargeId = employee.inchargeId;
    const oldManagerId = employee.managerId;

    // Assign to incharge
    employee.inchargeId = inchargeId;
    // Clear direct manager assignment when assigning to incharge
    employee.managerId = undefined;
    // Inherit department from incharge
    employee.department = incharge.department;
    // Inherit store from incharge
    employee.storeId = incharge.storeId;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Successfully assigned employee ${employeeId} to incharge ${inchargeId}`);

    return c.json({
      success: true,
      employee,
      message: 'Incharge assigned successfully',
      oldInchargeId,
      oldManagerId,
      newInchargeId: inchargeId,
      inheritedDepartment: incharge.department,
      inheritedStore: incharge.storeId
    });
  } catch (error) {
    console.log('Error assigning incharge to employee:', error);
    return c.json({ error: 'Failed to assign incharge' }, 500);
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

// ===== Custom Inventory Items Management =====

// Get all custom items
app.get('/make-server-c2dd9b9d/custom-items', async (c) => {
  try {
    // Query database directly since getByPrefix doesn't return keys
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', 'custom-item:%');
    
    if (error) {
      console.log('Error fetching custom items from DB:', error);
      return c.json({ customItems: [] });
    }
    
    const customItems = (data || []).map((item: any) => ({
      id: item.key.replace('custom-item:', ''),
      category: item.value.category,
      itemName: item.value.itemName,
      createdAt: item.value.createdAt
    }));
    
    return c.json({ customItems });
  } catch (error) {
    console.log('Error fetching custom items:', error);
    return c.json({ customItems: [] });
  }
});

// Add custom item to a category
app.post('/make-server-c2dd9b9d/custom-items', async (c) => {
  try {
    const { category, itemName } = await c.req.json();
    
    if (!category || !itemName) {
      return c.json({ error: 'Category and item name are required' }, 400);
    }
    
    // Check if this custom item already exists - query database directly
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: existingItems } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', 'custom-item:%');
    
    const duplicate = (existingItems || []).find((item: any) => 
      item.value.category === category && item.value.itemName === itemName
    );
    
    if (duplicate) {
      return c.json({ 
        customItem: {
          id: duplicate.key.replace('custom-item:', ''),
          category: duplicate.value.category,
          itemName: duplicate.value.itemName,
          createdAt: duplicate.value.createdAt
        }
      });
    }
    
    // Create new custom item
    const id = `custom-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const customItem = {
      category,
      itemName,
      createdAt: new Date().toISOString()
    };
    
    await kv.set(`custom-item:${id}`, customItem);
    
    return c.json({ 
      customItem: {
        id,
        ...customItem
      }
    });
  } catch (error) {
    console.log('Error adding custom item:', error);
    return c.json({ error: 'Failed to add custom item' }, 500);
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

// ============================================
// STORE MANAGEMENT ENDPOINTS
// ============================================

// Create store (cluster head only)
app.post('/make-server-c2dd9b9d/stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can create stores' }, 403);
    }

    const { name, location } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Store name is required' }, 400);
    }

    const storeId = `STORE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const store = {
      id: storeId,
      name,
      location: location || '',
      managerId: null,
      createdBy: authResult.user.id,
      createdAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, store);

    return c.json({ success: true, store });
  } catch (error) {
    console.log('Error creating store:', error);
    return c.json({ error: 'Failed to create store' }, 500);
  }
});

// Get all stores
app.get('/make-server-c2dd9b9d/stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const userId = authResult.user.id;
    const employeeId = authResult.user.user_metadata?.employeeId;

    const allStores = await kv.getByPrefix('store:');

    // Cluster heads see all stores
    if (role === 'cluster_head') {
      return c.json({ stores: allStores });
    }

    // Managers see only their store
    if (role === 'manager') {
      const managerStores = allStores.filter((s: any) => s.managerId === userId);
      return c.json({ stores: managerStores });
    }

    // Employees with designation (store/production incharge) see their assigned store
    if (role === 'employee' && employeeId) {
      const employee = await kv.get(`unified-employee:${employeeId}`);
      if (employee && employee.storeId) {
        const store = await kv.get(`store:${employee.storeId}`);
        if (store) {
          return c.json({ stores: [store] });
        }
      }
    }

    return c.json({ stores: [] });
  } catch (error) {
    console.log('Error fetching stores:', error);
    return c.json({ error: 'Failed to fetch stores' }, 500);
  }
});

// Assign manager to store (cluster head only)
app.put('/make-server-c2dd9b9d/stores/:storeId/assign-manager', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign managers' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { managerId } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Update the store with the manager
    const updatedStore = {
      ...store,
      managerId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    // Also update the manager's employee record to set their storeId
    if (managerId) {
      const allEmployees = await kv.getByPrefix('employee:');
      const managerEmployee = allEmployees.find((emp: any) => emp.employeeId === managerId);
      
      if (managerEmployee) {
        const updatedManager = {
          ...managerEmployee,
          storeId: storeId,
          updatedAt: new Date().toISOString()
        };
        await kv.set(`employee:${managerEmployee.id}`, updatedManager);
      }
    }

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error assigning manager:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Assign production house to store (cluster head only)
app.put('/make-server-c2dd9b9d/stores/:storeId/assign-production-house', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign production houses' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { productionHouseId } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Update the store with the production house
    const updatedStore = {
      ...store,
      productionHouseId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error assigning production house:', error);
    return c.json({ error: 'Failed to assign production house' }, 500);
  }
});

// Update store details
app.put('/make-server-c2dd9b9d/stores/:storeId', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can update stores' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { name, location } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    const updatedStore = {
      ...store,
      name: name || store.name,
      location: location !== undefined ? location : store.location,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error updating store:', error);
    return c.json({ error: 'Failed to update store' }, 500);
  }
});

// Migrate all existing data to a store (cluster head only)
app.post('/make-server-c2dd9b9d/stores/:storeId/migrate-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can migrate data' }, 403);
    }

    const storeId = c.req.param('storeId');

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    let migratedCount = {
      inventory: 0,
      overheads: 0,
      sales: 0,
      employees: 0,
      timesheets: 0,
      leaves: 0,
      payouts: 0
    };

    // Migrate inventory items without storeId
    const inventoryItems = await kv.getByPrefix('inventory:');
    for (const item of inventoryItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        await kv.set(`inventory:${item.id}`, updatedItem);
        migratedCount.inventory++;
      }
    }

    // Migrate overhead items without storeId
    const overheadItems = await kv.getByPrefix('overhead:');
    for (const item of overheadItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        await kv.set(`overhead:${item.id}`, updatedItem);
        migratedCount.overheads++;
      }
    }

    // Migrate sales data without storeId
    const salesItems = await kv.getByPrefix('sales:');
    for (const item of salesItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        // Sales keys have the format sales:userId:itemId, need to preserve this
        const key = `sales:${item.userId}:${item.id}`;
        await kv.set(key, updatedItem);
        migratedCount.sales++;
      }
    }

    // Migrate employees without storeId
    const employees = await kv.getByPrefix('employee:');
    for (const emp of employees) {
      if (!emp.storeId) {
        const updatedEmp = { ...emp, storeId };
        await kv.set(`employee:${emp.employeeId}`, updatedEmp);
        migratedCount.employees++;
      }
    }

    // Migrate timesheets without storeId
    const timesheets = await kv.getByPrefix('timesheet:');
    for (const ts of timesheets) {
      if (!ts.storeId) {
        const updatedTs = { ...ts, storeId };
        await kv.set(`timesheet:${ts.id}`, updatedTs);
        migratedCount.timesheets++;
      }
    }

    // Migrate leaves without storeId
    const leaves = await kv.getByPrefix('leave:');
    for (const leave of leaves) {
      if (!leave.storeId) {
        const updatedLeave = { ...leave, storeId };
        await kv.set(`leave:${leave.id}`, updatedLeave);
        migratedCount.leaves++;
      }
    }

    // Migrate payouts without storeId
    const payouts = await kv.getByPrefix('payout:');
    for (const payout of payouts) {
      if (!payout.storeId) {
        const updatedPayout = { ...payout, storeId };
        await kv.set(`payout:${payout.id}`, updatedPayout);
        migratedCount.payouts++;
      }
    }

    return c.json({ 
      success: true, 
      message: `Data migrated to ${store.name}`,
      migratedCount
    });
  } catch (error) {
    console.log('Error migrating data:', error);
    return c.json({ error: 'Failed to migrate data' }, 500);
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// Get notifications for user
app.get('/make-server-c2dd9b9d/notifications', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const allNotifications = await kv.getByPrefix(`notification:${userId}:`);
    
    // Sort by createdAt descending (newest first)
    const sortedNotifications = allNotifications.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    return c.json({ notifications: sortedNotifications });
  } catch (error) {
    console.log('Error fetching notifications:', error);
    return c.json({ error: 'Failed to fetch notifications' }, 500);
  }
});

// Mark notification as read
app.put('/make-server-c2dd9b9d/notifications/:id/read', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const notificationId = c.req.param('id');
    const key = `notification:${userId}:${notificationId}`;
    
    const allNotifications = await kv.getByPrefix(`notification:${userId}:`);
    const notification = allNotifications.find((n: any) => n.id === notificationId);
    
    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    
    const updatedNotification = {
      ...notification,
      read: true
    };
    
    await kv.set(key, updatedNotification);
    
    return c.json({ success: true, notification: updatedNotification });
  } catch (error) {
    console.log('Error marking notification as read:', error);
    return c.json({ error: 'Failed to mark notification as read' }, 500);
  }
});

// Mark all notifications as read
app.put('/make-server-c2dd9b9d/notifications/read-all', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const allNotifications = await kv.getByPrefix(`notification:${userId}:`);
    
    // Update all to read
    for (const notification of allNotifications) {
      if (!notification.read) {
        const key = `notification:${userId}:${notification.id}`;
        await kv.set(key, { ...notification, read: true });
      }
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error marking all notifications as read:', error);
    return c.json({ error: 'Failed to mark all notifications as read' }, 500);
  }
});

// Create notification (internal helper)
async function createNotification(userId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) {
  const notificationId = crypto.randomUUID();
  const notification = {
    id: notificationId,
    userId,
    type,
    title,
    message,
    relatedId: relatedId || null,
    relatedDate: relatedDate || null,
    read: false,
    createdAt: new Date().toISOString()
  };
  
  await kv.set(`notification:${userId}:${notificationId}`, notification);
  return notification;
}

// Helper to get all cluster heads
async function getAllClusterHeads() {
  const allUsers = await kv.getByPrefix('unified-employee:');
  return allUsers.filter((u: any) => u.role === 'cluster_head');
}

// Helper to get operations managers (excluding store/production incharges)
async function getOperationsManagers(storeId?: string) {
  const allUsers = await kv.getByPrefix('unified-employee:');
  const managers = allUsers.filter((u: any) => 
    u.role === 'manager' && 
    u.designation !== 'store_incharge' && 
    u.designation !== 'production_incharge'
  );
  
  // Filter by store if provided
  if (storeId) {
    return managers.filter((m: any) => !m.storeId || m.storeId === storeId);
  }
  
  return managers;
}

// Helper to get all production heads/incharges
async function getAllProductionHeads() {
  const allUsers = await kv.getByPrefix('unified-employee:');
  return allUsers.filter((u: any) => u.designation === 'production_incharge');
}

// Helper to get store incharge for a specific store
async function getStoreIncharge(storeId: string) {
  const allUsers = await kv.getByPrefix('unified-employee:');
  return allUsers.find((u: any) => u.designation === 'store_incharge' && u.storeId === storeId);
}

// ============================================
// PRODUCTION REQUESTS ROUTES
// ============================================

// Get all production requests
app.get('/make-server-c2dd9b9d/production-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const requests = await kv.getByPrefix('production_request_') || [];
    
    // Sort by request date descending (newest first)
    const sortedRequests = requests.sort((a: any, b: any) => {
      return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
    });
    
    return c.json({ requests: sortedRequests });
  } catch (error: any) {
    console.error('Error fetching production requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new production request
app.post('/make-server-c2dd9b9d/production-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Fetch store name from storeId if not provided
    let storeName = body.storeName;
    if (body.storeId && !storeName) {
      console.log('Fetching store name for storeId:', body.storeId);
      const store = await kv.get(`store:${body.storeId}`);
      if (store) {
        storeName = store.name;
        console.log('Found store:', { id: store.id, name: store.name });
      } else {
        storeName = 'Unknown Store';
        console.log('Store not found for storeId:', body.storeId);
      }
    }
    
    const request = {
      id,
      ...body,
      storeName, // Override with fetched store name
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    
    await kv.set(`production_request_${id}`, request);
    
    console.log('Production request created:', { id, storeId: request.storeId, storeName: request.storeName, requestedBy: request.requestedBy });
    
    // Send notification to all Production Heads
    const productionHeads = await getAllProductionHeads();
    console.log('Notifying production heads:', productionHeads.length);
    
    for (const prodHead of productionHeads) {
      if (prodHead.authUserId) {
        await createNotification(
          prodHead.authUserId,
          'production_request_new',
          'New Production Request',
          `${request.storeName} has submitted a new production request for ${new Date(request.requestDate).toLocaleDateString()}`,
          id,
          request.requestDate
        );
      }
    }
    
    return c.json({ request });
  } catch (error: any) {
    console.error('Error creating production request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update production request status
app.put('/make-server-c2dd9b9d/production-requests/:id/status', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { status, updatedBy } = await c.req.json();
    
    const existingRequest = await kv.get(`production_request_${id}`);
    if (!existingRequest) {
      return c.json({ error: 'Production request not found' }, 404);
    }
    
    const now = new Date().toISOString();
    const updates: any = {
      status,
      updatedAt: now,
    };
    
    // Update timestamps based on status
    switch (status) {
      case 'accepted':
        updates.acceptedAt = now;
        updates.acceptedBy = updatedBy;
        break;
      case 'in-preparation':
        // Status set by production head after accepting
        break;
      case 'prepared':
        updates.preparedAt = now;
        break;
      case 'shipped':
        updates.shippedAt = now;
        break;
      case 'delivered':
        updates.deliveredAt = now;
        updates.deliveredBy = updatedBy;
        
        // Update store inventory when delivered
        console.log('📦 Updating store inventory for delivered request:', { 
          requestId: id, 
          storeId: existingRequest.storeId 
        });
        
        try {
          // Get current store inventory
          const storeKey = `store_${existingRequest.storeId}`;
          const store = await kv.get(storeKey);
          
          if (store) {
            const currentInventory = store.inventory || {};
            
            // Get all inventory items to build field mapping
            const inventoryItemsData = await kv.getByPrefix('inventory_item_');
            const finishedProducts = inventoryItemsData
              .filter((item: any) => item.category === 'finished_product' && item.isActive)
              .map((item: any) => ({
                key: item.name,
                camelKey: item.name.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase()),
                displayName: item.displayName
              }));
            
            // Add requested quantities to store inventory
            finishedProducts.forEach(({ camelKey, key }: any) => {
              const requestedQty = existingRequest[camelKey] || existingRequest[camelKey + 's'] || 0;
              if (requestedQty > 0) {
                currentInventory[camelKey] = (currentInventory[camelKey] || 0) + requestedQty;
                console.log(`  ✅ Added ${requestedQty} ${camelKey} to store inventory`);
              }
            });
            
            // Save updated store inventory
            await kv.set(storeKey, {
              ...store,
              inventory: currentInventory,
              updatedAt: now
            });
            
            console.log('✅ Store inventory updated successfully:', currentInventory);
            
            // Also deduct from production house inventory
            const productionHouseId = store.productionHouseId;
            if (productionHouseId) {
              console.log('🏭 Deducting from production house inventory:', productionHouseId);
              
              const productionHouseKey = `production_house_${productionHouseId}`;
              const productionHouse = await kv.get(productionHouseKey);
              
              if (productionHouse) {
                const phInventory = productionHouse.inventory || {};
                
                // Deduct requested quantities from production house inventory
                finishedProducts.forEach(({ camelKey }: any) => {
                  const requestedQty = existingRequest[camelKey] || existingRequest[camelKey + 's'] || 0;
                  if (requestedQty > 0) {
                    phInventory[camelKey] = (phInventory[camelKey] || 0) - requestedQty;
                    console.log(`  ⬇️ Deducted ${requestedQty} ${camelKey} from production house inventory`);
                  }
                });
                
                // Save updated production house inventory
                await kv.set(productionHouseKey, {
                  ...productionHouse,
                  inventory: phInventory,
                  updatedAt: now
                });
                
                console.log('✅ Production house inventory updated:', phInventory);
              } else {
                console.warn('⚠️ Production house not found:', productionHouseId);
              }
            } else {
              console.warn('⚠️ Store has no mapped production house');
            }
          } else {
            console.warn('⚠️ Store not found for inventory update:', existingRequest.storeId);
          }
        } catch (invError) {
          console.error('❌ Error updating store inventory:', invError);
          // Don't fail the whole request update if inventory update fails
        }
        break;
    }
    
    const updatedRequest = {
      ...existingRequest,
      ...updates,
    };
    
    await kv.set(`production_request_${id}`, updatedRequest);
    
    console.log('Production request status updated:', { id, status, updatedBy });
    
    // Send notifications based on status change
    const storeName = updatedRequest.storeName || 'Unknown Store';
    const requestDate = new Date(updatedRequest.requestDate).toLocaleDateString();
    
    // Notify Store In-Charge, Operations Managers, and Cluster Heads about status changes
    const storeIncharge = await getStoreIncharge(updatedRequest.storeId);
    const operationsManagers = await getOperationsManagers(updatedRequest.storeId);
    const clusterHeads = await getAllClusterHeads();
    
    // Combine all stakeholders who should be notified
    const stakeholders = [];
    if (storeIncharge?.authUserId) stakeholders.push({ ...storeIncharge, role: 'Store In-Charge' });
    operationsManagers.forEach(om => {
      if (om.authUserId) stakeholders.push({ ...om, role: 'Operations Manager' });
    });
    clusterHeads.forEach(ch => {
      if (ch.authUserId) stakeholders.push({ ...ch, role: 'Cluster Head' });
    });
    
    // Create status-specific notifications
    let notificationTitle = '';
    let notificationMessage = '';
    
    switch (status) {
      case 'accepted':
        notificationTitle = 'Production Request Accepted';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been accepted and is ready for preparation`;
        break;
      case 'in-preparation':
        notificationTitle = 'Production Started';
        notificationMessage = `Production request from ${storeName} for ${requestDate} is now in preparation`;
        break;
      case 'prepared':
        notificationTitle = 'Production Completed';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been prepared and is ready for shipping`;
        break;
      case 'shipped':
        notificationTitle = 'Production Shipped';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been shipped and is on the way`;
        break;
      case 'delivered':
        notificationTitle = 'Production Delivered';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been successfully delivered`;
        break;
    }
    
    // Send notifications to all stakeholders
    console.log('Sending status update notifications to', stakeholders.length, 'stakeholders');
    for (const stakeholder of stakeholders) {
      await createNotification(
        stakeholder.authUserId,
        `production_request_${status}`,
        notificationTitle,
        notificationMessage,
        id,
        updatedRequest.requestDate
      );
    }
    
    return c.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error updating production request status:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// SALES DATA ENDPOINTS (XLSX Upload)
// ============================================

// Get all sales data records
app.get('/make-server-c2dd9b9d/sales-data', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const records = await kv.getByPrefix('sales_data_');
    
    console.log('Retrieved sales data records:', records.length);
    
    return c.json({ data: records });
  } catch (error: any) {
    console.error('Error fetching sales data:', error);
    return c.json({ error: error.message || 'Failed to fetch sales data' }, 500);
  }
});

// Create/save new sales data record
app.post('/make-server-c2dd9b9d/sales-data', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const record = await c.req.json();
    
    // Validate required fields
    if (!record.id || !record.date || !record.storeId || !record.data) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Save the record
    await kv.set(`sales_data_${record.id}`, record);
    
    console.log('Sales data record saved:', { id: record.id, date: record.date, storeId: record.storeId });
    
    return c.json({ record });
  } catch (error: any) {
    console.error('Error saving sales data:', error);
    return c.json({ error: error.message || 'Failed to save sales data' }, 500);
  }
});

// Delete a sales data record
app.delete('/make-server-c2dd9b9d/sales-data/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    
    const existingRecord = await kv.get(`sales_data_${id}`);
    if (!existingRecord) {
      return c.json({ error: 'Sales data record not found' }, 404);
    }
    
    await kv.del(`sales_data_${id}`);
    
    console.log('Sales data record deleted:', id);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sales data:', error);
    return c.json({ error: error.message || 'Failed to delete sales data' }, 500);
  }
});

// ============================================
// MIGRATION ENDPOINT - Production House System
// ============================================

// One-time migration to set up production house system
app.post('/make-server-c2dd9b9d/migrate-production-house-system', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  // Only cluster heads can run migrations
  const userRole = auth.user.user_metadata?.role;
  if (userRole !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can run migrations' }, 403);
  }

  try {
    console.log('🚀 Starting Production House System Migration...');
    
    // Step 1: Check if production house already exists
    const existingHouses = await kv.getByPrefix('production_house_');
    if (existingHouses.length > 0) {
      console.log('ℹ️  Production houses already exist. Skipping creation.');
    } else {
      // Create default production house
      const defaultHouseId = crypto.randomUUID();
      const defaultHouse = {
        id: defaultHouseId,
        name: 'Main Production House',
        location: 'Sector 21, Dwarka',
        productionHeadId: null,
        inventory: {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        },
        createdBy: auth.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
      console.log('✅ Created default production house:', defaultHouseId);

      // Step 2: Map all existing stores to this production house
      const stores = await kv.getByPrefix('store_');
      let mappedStores = 0;
      
      for (const store of stores) {
        const updated = {
          ...store,
          productionHouseId: defaultHouseId,
          updatedAt: new Date().toISOString(),
        };
        await kv.set(`store_${store.id}`, updated);
        mappedStores++;
      }
      console.log(`✅ Mapped ${mappedStores} stores to production house`);

      // Step 3: Find all production heads and assign to production house
      const employees = await kv.getByPrefix('employee_');
      const productionHeads = employees.filter(e => e.designation === 'production_incharge');
      
      if (productionHeads.length > 0) {
        // Assign first production head to the house
        const firstHead = productionHeads[0];
        defaultHouse.productionHeadId = firstHead.employeeId;
        await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
        console.log(`✅ Assigned production head: ${firstHead.name} (${firstHead.employeeId})`);
      }

      // Step 4: Migrate ProductionData from storeId to productionHouseId
      const productionRecords = await kv.getByPrefix('production_');
      let migratedRecords = 0;

      for (const record of productionRecords) {
        if (record.storeId && !record.productionHouseId) {
          const updated = {
            ...record,
            productionHouseId: defaultHouseId,
            // Keep storeId for now for backward compatibility
          };
          await kv.set(`production_${record.id}`, updated);
          migratedRecords++;
        }
      }
      console.log(`✅ Migrated ${migratedRecords} production records`);

      // Step 5: Calculate initial inventory from last 7 days of production
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

      const recentProduction = productionRecords.filter(p => 
        p.date >= cutoffDate && p.approvalStatus === 'approved'
      );

      const totalProduction = recentProduction.reduce((acc, prod) => ({
        chicken: acc.chicken + (prod.chickenMomos?.final || 0),
        chickenCheese: acc.chickenCheese + (prod.chickenCheeseMomos?.final || 0),
        veg: acc.veg + (prod.vegMomos?.final || 0),
        cheeseCorn: acc.cheeseCorn + (prod.cheeseCornMomos?.final || 0),
        paneer: acc.paneer + (prod.paneerMomos?.final || 0),
        vegKurkure: acc.vegKurkure + (prod.vegKurkureMomos?.final || 0),
        chickenKurkure: acc.chickenKurkure + (prod.chickenKurkureMomos?.final || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0, 
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });

      // Update inventory
      defaultHouse.inventory = totalProduction;
      await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
      
      const totalInventory = Object.values(totalProduction).reduce((sum, val) => sum + val, 0);
      console.log(`✅ Initialized inventory with ${totalInventory} total momos from last 7 days`);
    }

    return c.json({
      success: true,
      message: 'Production house system migration completed successfully!',
      details: {
        productionHousesCreated: existingHouses.length === 0 ? 1 : 0,
        alreadyExisted: existingHouses.length > 0,
      }
    });

  } catch (error: any) {
    console.error('❌ Migration error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PRODUCTION HOUSE ENDPOINTS
// ============================================

// Get all production houses
app.get('/make-server-c2dd9b9d/production-houses', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const houses = await kv.getByPrefix('production_house_');
    console.log('Retrieved production houses:', houses.length);
    return c.json({ productionHouses: houses });
  } catch (error: any) {
    console.error('Error fetching production houses:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new production house
app.post('/make-server-c2dd9b9d/production-houses', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const body = await c.req.json();
    const { name, location, productionHeadId, inventory, createdBy } = body;

    if (!name || !location) {
      return c.json({ error: 'Name and location are required' }, 400);
    }

    const id = crypto.randomUUID();
    const productionHouse = {
      id,
      name,
      location,
      productionHeadId: productionHeadId || null,
      inventory: inventory || {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      },
      createdBy: createdBy || auth.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, productionHouse);
    console.log('Production house created:', { id, name, location });

    return c.json({ productionHouse });
  } catch (error: any) {
    console.error('Error creating production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update production house
app.put('/make-server-c2dd9b9d/production-houses/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const updates = await c.req.json();

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production house updated:', id);

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error updating production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update production house inventory
app.put('/make-server-c2dd9b9d/production-houses/:id/inventory', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { inventory } = await c.req.json();

    if (!inventory) {
      return c.json({ error: 'Inventory data required' }, 400);
    }

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    const updated = {
      ...existing,
      inventory,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production house inventory updated:', id);

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error updating production house inventory:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Assign production head to production house
app.put('/make-server-c2dd9b9d/production-houses/:id/assign-head', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { productionHeadId } = await c.req.json();

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Update production house
    const updated = {
      ...existing,
      productionHeadId,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production head assigned to production house:', { houseId: id, headId: productionHeadId });

    // IMPORTANT: Also update the employee's storeId to point to this production house
    // This ensures that when the production head creates production records, they use the correct production house ID
    if (productionHeadId) {
      const employee = await kv.get(`employee_${productionHeadId}`);
      if (employee) {
        const updatedEmployee = {
          ...employee,
          storeId: id, // Set employee's storeId to the production house ID
          updatedAt: new Date().toISOString(),
        };
        await kv.set(`employee_${productionHeadId}`, updatedEmployee);
        console.log('✅ Updated employee storeId to production house ID:', { employeeId: productionHeadId, productionHouseId: id });
      } else {
        console.warn('⚠️  Employee not found:', productionHeadId);
      }
    }

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error assigning production head:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fix production records for a production house (update old records that have wrong storeId/productionHouseId)
app.post('/make-server-c2dd9b9d/production-houses/:id/fix-records', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const productionHouseId = c.req.param('id');
    const { oldStoreId } = await c.req.json(); // The old storeId that was incorrectly used

    if (!oldStoreId) {
      return c.json({ error: 'oldStoreId is required' }, 400);
    }

    const productionHouse = await kv.get(`production_house_${productionHouseId}`);
    if (!productionHouse) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Find all production records with the old storeId
    const allProduction = await kv.getByPrefix('production:');
    let updatedCount = 0;

    for (const record of allProduction) {
      // Update records that match the old storeId
      if (record.storeId === oldStoreId || record.productionHouseId === oldStoreId) {
        const updated = {
          ...record,
          productionHouseId: productionHouseId, // Set correct production house ID
          storeId: record.storeId, // Keep original storeId for backward compatibility
        };
        // Use the correct key format: production:userId:recordId
        const key = `production:${record.userId}:${record.id}`;
        await kv.set(key, updated);
        updatedCount++;
        console.log('✅ Fixed production record:', { recordId: record.id, date: record.date, oldId: oldStoreId, newId: productionHouseId });
      }
    }

    return c.json({ 
      success: true, 
      updatedCount,
      message: `Fixed ${updatedCount} production records`
    });
  } catch (error: any) {
    console.error('Error fixing production records:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Assign store to production house
app.put('/make-server-c2dd9b9d/stores/:storeId/assign-production-house', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const storeId = c.req.param('storeId');
    const { productionHouseId } = await c.req.json();

    const existing = await kv.get(`store_${storeId}`);
    if (!existing) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Verify production house exists
    const house = await kv.get(`production_house_${productionHouseId}`);
    if (!house) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    const updated = {
      ...existing,
      productionHouseId,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`store_${storeId}`, updated);
    console.log('Store assigned to production house:', { storeId, productionHouseId });

    return c.json({ store: updated });
  } catch (error: any) {
    console.error('Error assigning store to production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete production house
app.delete('/make-server-c2dd9b9d/production-houses/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');

    // Check if production house exists
    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Check if any stores are mapped to this production house
    const allStores = await kv.getByPrefix('store_');
    const mappedStores = allStores.filter((store: any) => store.productionHouseId === id);
    
    if (mappedStores.length > 0) {
      return c.json({ 
        error: `Cannot delete production house. ${mappedStores.length} store(s) are currently mapped to it. Please unmap stores first.` 
      }, 400);
    }

    // Delete the production house
    await kv.del(`production_house_${id}`);
    console.log('Production house deleted:', id);

    return c.json({ success: true, message: 'Production house deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Transfer inventory between production houses
app.post('/make-server-c2dd9b9d/production-houses/transfer-inventory', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const { fromHouseId, toHouseId, quantities } = await c.req.json();

    if (!fromHouseId || !toHouseId) {
      return c.json({ error: 'Both fromHouseId and toHouseId are required' }, 400);
    }

    if (fromHouseId === toHouseId) {
      return c.json({ error: 'Cannot transfer to the same production house' }, 400);
    }

    // Get both production houses
    const fromHouse = await kv.get(`production_house_${fromHouseId}`);
    const toHouse = await kv.get(`production_house_${toHouseId}`);

    if (!fromHouse) {
      return c.json({ error: `Source production house not found: ${fromHouseId}` }, 404);
    }

    if (!toHouse) {
      return c.json({ error: `Destination production house not found: ${toHouseId}` }, 404);
    }

    // If quantities not provided, transfer all
    const transferQuantities = quantities || {
      chicken: fromHouse.inventory?.chicken || 0,
      chickenCheese: fromHouse.inventory?.chickenCheese || 0,
      veg: fromHouse.inventory?.veg || 0,
      cheeseCorn: fromHouse.inventory?.cheeseCorn || 0,
      paneer: fromHouse.inventory?.paneer || 0,
      vegKurkure: fromHouse.inventory?.vegKurkure || 0,
      chickenKurkure: fromHouse.inventory?.chickenKurkure || 0,
    };

    // Validate quantities don't exceed available stock
    const momoTypes = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'];
    for (const type of momoTypes) {
      const transferQty = transferQuantities[type] || 0;
      const availableQty = fromHouse.inventory?.[type] || 0;
      
      if (transferQty < 0) {
        return c.json({ error: `Invalid quantity for ${type}: cannot be negative` }, 400);
      }
      
      if (transferQty > availableQty) {
        return c.json({ 
          error: `Insufficient stock for ${type}: requested ${transferQty}, available ${availableQty}` 
        }, 400);
      }
    }

    // Transfer inventory from source to destination
    const updatedToHouse = {
      ...toHouse,
      inventory: {
        chicken: (toHouse.inventory?.chicken || 0) + (transferQuantities.chicken || 0),
        chickenCheese: (toHouse.inventory?.chickenCheese || 0) + (transferQuantities.chickenCheese || 0),
        veg: (toHouse.inventory?.veg || 0) + (transferQuantities.veg || 0),
        cheeseCorn: (toHouse.inventory?.cheeseCorn || 0) + (transferQuantities.cheeseCorn || 0),
        paneer: (toHouse.inventory?.paneer || 0) + (transferQuantities.paneer || 0),
        vegKurkure: (toHouse.inventory?.vegKurkure || 0) + (transferQuantities.vegKurkure || 0),
        chickenKurkure: (toHouse.inventory?.chickenKurkure || 0) + (transferQuantities.chickenKurkure || 0),
      },
      updatedAt: new Date().toISOString(),
    };

    // Deduct transferred quantities from source
    const updatedFromHouse = {
      ...fromHouse,
      inventory: {
        chicken: (fromHouse.inventory?.chicken || 0) - (transferQuantities.chicken || 0),
        chickenCheese: (fromHouse.inventory?.chickenCheese || 0) - (transferQuantities.chickenCheese || 0),
        veg: (fromHouse.inventory?.veg || 0) - (transferQuantities.veg || 0),
        cheeseCorn: (fromHouse.inventory?.cheeseCorn || 0) - (transferQuantities.cheeseCorn || 0),
        paneer: (fromHouse.inventory?.paneer || 0) - (transferQuantities.paneer || 0),
        vegKurkure: (fromHouse.inventory?.vegKurkure || 0) - (transferQuantities.vegKurkure || 0),
        chickenKurkure: (fromHouse.inventory?.chickenKurkure || 0) - (transferQuantities.chickenKurkure || 0),
      },
      updatedAt: new Date().toISOString(),
    };

    // Save both updates
    await kv.set(`production_house_${toHouseId}`, updatedToHouse);
    await kv.set(`production_house_${fromHouseId}`, updatedFromHouse);

    console.log('Inventory transferred:', { 
      from: fromHouse.name, 
      to: toHouse.name,
      quantities: transferQuantities 
    });

    return c.json({ 
      success: true, 
      message: 'Inventory transferred successfully',
      fromHouse: updatedFromHouse,
      toHouse: updatedToHouse
    });
  } catch (error: any) {
    console.error('Error transferring inventory:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK REQUEST ENDPOINTS
// ============================================

// Get all stock requests
app.get('/make-server-c2dd9b9d/stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const requests = await kv.getByPrefix('stock_request_');
    console.log('Retrieved stock requests:', requests.length);
    return c.json({ stockRequests: requests });
  } catch (error: any) {
    console.error('Error fetching stock requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new stock request
app.post('/make-server-c2dd9b9d/stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const body = await c.req.json();
    const { 
      storeId, 
      storeName,
      productionHouseId, 
      productionHouseName,
      requestedBy, 
      requestedByName,
      requestDate,
      requestedQuantities 
    } = body;

    if (!storeId || !productionHouseId || !requestedBy || !requestDate || !requestedQuantities) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const id = crypto.randomUUID();
    const stockRequest = {
      id,
      storeId,
      storeName: storeName || '',
      productionHouseId,
      productionHouseName: productionHouseName || '',
      requestedBy,
      requestedByName: requestedByName || '',
      requestDate,
      requestedQuantities,
      fulfilledQuantities: null,
      status: 'pending',
      fulfilledBy: null,
      fulfilledByName: null,
      fulfillmentDate: null,
      notes: null,
    };

    await kv.set(`stock_request_${id}`, stockRequest);
    console.log('Stock request created:', { id, storeId, productionHouseId });

    // Send notification to production heads of the target production house
    const productionHeads = await getAllProductionHeads();
    console.log('All production heads:', productionHeads.length);
    
    // Filter production heads for this specific production house
    const relevantProductionHeads = productionHeads.filter((ph: any) => 
      ph.productionHouseId === productionHouseId
    );
    
    console.log('Notifying production heads for production house', productionHouseId, ':', relevantProductionHeads.length);
    
    for (const prodHead of relevantProductionHeads) {
      if (prodHead.authUserId) {
        await createNotification(
          prodHead.authUserId,
          'stock_request_new',
          'New Stock Request',
          `${storeName} has requested stock from ${productionHouseName} for ${new Date(requestDate).toLocaleDateString()}`,
          id,
          requestDate
        );
        console.log('Notified production head:', prodHead.name, prodHead.authUserId);
      }
    }
    
    // If no production heads found for specific house, notify all production heads
    if (relevantProductionHeads.length === 0) {
      console.log('No production heads found for house', productionHouseId, ', notifying all production heads');
      for (const prodHead of productionHeads) {
        if (prodHead.authUserId) {
          await createNotification(
            prodHead.authUserId,
            'stock_request_new',
            'New Stock Request',
            `${storeName} has requested stock from ${productionHouseName} for ${new Date(requestDate).toLocaleDateString()}`,
            id,
            requestDate
          );
          console.log('Notified production head (fallback):', prodHead.name, prodHead.authUserId);
        }
      }
    }

    return c.json({ stockRequest });
  } catch (error: any) {
    console.error('Error creating stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fulfill stock request
app.put('/make-server-c2dd9b9d/stock-requests/:id/fulfill', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { fulfilledQuantities, fulfilledBy, fulfilledByName, notes } = await c.req.json();

    const existing = await kv.get(`stock_request_${id}`);
    if (!existing) {
      return c.json({ error: 'Stock request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Stock request already processed' }, 400);
    }

    // Determine status based on fulfillment
    let status = 'fulfilled';
    const requested = existing.requestedQuantities;
    const fulfilled = fulfilledQuantities;
    
    const isPartial = Object.keys(requested).some(key => 
      fulfilled[key] < requested[key] && fulfilled[key] > 0
    );
    
    if (isPartial) {
      status = 'partially_fulfilled';
    }

    const updated = {
      ...existing,
      fulfilledQuantities,
      fulfilledBy,
      fulfilledByName: fulfilledByName || '',
      fulfillmentDate: new Date().toISOString(),
      notes: notes || null,
      status,
    };

    await kv.set(`stock_request_${id}`, updated);

    // Update production house inventory (decrease)
    const house = await kv.get(`production_house_${existing.productionHouseId}`);
    if (house) {
      const newInventory = { ...house.inventory };
      Object.keys(fulfilledQuantities).forEach(key => {
        newInventory[key] = Math.max(0, (newInventory[key] || 0) - fulfilledQuantities[key]);
      });

      await kv.set(`production_house_${existing.productionHouseId}`, {
        ...house,
        inventory: newInventory,
        updatedAt: new Date().toISOString(),
      });

      console.log('Production house inventory updated after fulfillment:', existing.productionHouseId);
    }

    console.log('Stock request fulfilled:', { id, status });

    return c.json({ stockRequest: updated });
  } catch (error: any) {
    console.error('Error fulfilling stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Cancel stock request
app.put('/make-server-c2dd9b9d/stock-requests/:id/cancel', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');

    const existing = await kv.get(`stock_request_${id}`);
    if (!existing) {
      return c.json({ error: 'Stock request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Can only cancel pending requests' }, 400);
    }

    const updated = {
      ...existing,
      status: 'cancelled',
    };

    await kv.set(`stock_request_${id}`, updated);
    console.log('Stock request cancelled:', id);

    return c.json({ stockRequest: updated });
  } catch (error: any) {
    console.error('Error cancelling stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fix old stock request data - ensure all requests have proper productionHouseId from store mapping
app.post('/make-server-c2dd9b9d/fix-stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    console.log('🔧 Starting stock request data fix...');
    
    // Get all stock requests
    const allRequests = await kv.getByPrefix('stock_request_');
    console.log(`Found ${allRequests.length} stock requests to check`);
    
    // Get all stores to map storeId -> productionHouseId
    const allStores = await kv.getByPrefix('store_');
    const storeMap = new Map();
    allStores.forEach((store: any) => {
      storeMap.set(store.id, store.productionHouseId);
    });
    console.log(`Loaded ${storeMap.size} store mappings`);
    
    let fixedCount = 0;
    let unchangedCount = 0;
    const fixed: any[] = [];
    
    for (const request of allRequests) {
      const correctProductionHouseId = storeMap.get(request.storeId);
      
      if (!correctProductionHouseId) {
        console.log(`⚠️ Warning: Store ${request.storeId} not found in store map`);
        continue;
      }
      
      // Check if productionHouseId needs fixing
      if (request.productionHouseId !== correctProductionHouseId) {
        console.log(`Fixing request ${request.id}: ${request.productionHouseId} -> ${correctProductionHouseId}`);
        
        const updatedRequest = {
          ...request,
          productionHouseId: correctProductionHouseId
        };
        
        await kv.set(`stock_request_${request.id}`, updatedRequest);
        fixedCount++;
        fixed.push({
          id: request.id,
          storeId: request.storeId,
          oldProductionHouseId: request.productionHouseId,
          newProductionHouseId: correctProductionHouseId,
          status: request.status
        });
      } else {
        unchangedCount++;
      }
    }
    
    console.log(`✅ Stock request fix complete: ${fixedCount} fixed, ${unchangedCount} unchanged`);
    
    return c.json({
      success: true,
      message: `Fixed ${fixedCount} stock requests, ${unchangedCount} were already correct`,
      fixed,
      totalChecked: allRequests.length
    });
  } catch (error: any) {
    console.error('Error fixing stock requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK RECALIBRATION ROUTES
// ============================================

// Submit monthly stock recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const recalibrationData = await c.req.json();
    const { locationId, locationType, locationName, items } = recalibrationData;

    console.log(`📊 Processing stock recalibration for ${locationType}: ${locationName}`);

    // Create a unique ID for this recalibration record
    const recalibrationId = `recal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const currentDate = new Date().toISOString();

    // Store the recalibration record
    const recalibrationRecord = {
      id: recalibrationId,
      locationId,
      locationType,
      locationName,
      date: currentDate,
      status: 'pending', // Default status is pending approval
      performedBy: auth.user.id,
      performedByName: auth.user.user_metadata?.name || auth.user.email,
      items,
      totalItems: items.length,
      itemsWithDifference: items.filter((item: any) => item.difference !== 0).length,
      totalWastage: items
        .filter((item: any) => item.adjustmentType === 'wastage' && item.difference < 0)
        .reduce((sum: number, item: any) => sum + Math.abs(item.difference), 0),
      totalCountingErrors: items
        .filter((item: any) => item.adjustmentType === 'counting_error')
        .reduce((sum: number, item: any) => sum + Math.abs(item.difference), 0)
    };

    await kv.set(`recalibration_${recalibrationId}`, recalibrationRecord);

    // Update inventory quantities based on actual count
    let updatedCount = 0;
    for (const item of items) {
      if (item.difference !== 0) {
        try {
          const inventoryItem = await kv.get(`inventory_${item.itemId}`);
          if (inventoryItem) {
            const updatedItem = {
              ...inventoryItem,
              quantity: item.actualQuantity,
              lastRecalibrated: currentDate,
              lastRecalibratedBy: auth.user.user_metadata?.name || auth.user.email
            };
            await kv.set(`inventory_${item.itemId}`, updatedItem);
            updatedCount++;
          }
        } catch (err) {
          console.error(`Error updating inventory item ${item.itemId}:`, err);
        }
      }
    }

    console.log(`✅ Recalibration complete: ${updatedCount} items updated`);

    return c.json({
      success: true,
      message: `Stock recalibration completed successfully. ${updatedCount} items updated.`,
      recalibrationId,
      updatedCount
    });

  } catch (error: any) {
    console.error('Error processing recalibration:', error);
    return c.json({ error: error.message || 'Failed to process recalibration' }, 500);
  }
});

// Get latest recalibration for a location
app.get('/make-server-c2dd9b9d/stock-recalibration/latest/:locationId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const locationId = c.req.param('locationId');
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'

    // Get all recalibration records for this location
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    let locationRecalibrations = allRecalibrations
      .filter((r: any) => r.locationId === locationId);
    
    // Filter by locationType if provided
    if (locationType) {
      locationRecalibrations = locationRecalibrations
        .filter((r: any) => r.locationType === locationType);
    }
    
    locationRecalibrations = locationRecalibrations
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (locationRecalibrations.length === 0) {
      return c.json({ lastRecalibration: null });
    }

    return c.json({ 
      lastRecalibration: locationRecalibrations[0].date,
      record: locationRecalibrations[0]
    });

  } catch (error: any) {
    console.error('Error fetching latest recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get recalibration history for a location
app.get('/make-server-c2dd9b9d/stock-recalibration/history/:locationId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const locationId = c.req.param('locationId');
    const role = auth.user.user_metadata?.role;
    // Get locationType from query parameter to filter results
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'

    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    let locationRecalibrations;
    
    // If locationId is "all-cluster-locations", fetch for all managed locations
    if (locationId === 'all-cluster-locations' && role === 'cluster_head') {
      const employeeId = auth.user.user_metadata?.employeeId;
      const employee = await kv.get(`unified-employee:${employeeId}`);
      
      if (employee) {
        const managedStoreIds = employee.managedStoreIds || [];
        const managedProductionHouseIds = employee.managedProductionHouseIds || [];
        const allManagedIds = [...managedStoreIds, ...managedProductionHouseIds];
        
        locationRecalibrations = allRecalibrations
          .filter((r: any) => {
            const matchesLocation = allManagedIds.includes(r.locationId);
            const matchesType = !locationType || r.locationType === locationType;
            return matchesLocation && matchesType;
          })
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else {
        locationRecalibrations = [];
      }
    } else {
      // Standard query for a specific location
      // IMPORTANT FIX: Only filter by locationId AND locationType
      // DO NOT mix production house and store recalibrations
      
      console.log(`📋 Recalibration History Query:
        - Querying locationId: ${locationId}
        - Filtering by locationType: ${locationType || 'ALL'}`);
      
      // Only return recalibrations for THIS specific location
      // If locationType is specified, ONLY return that type
      locationRecalibrations = allRecalibrations
        .filter((r: any) => {
          const matchesLocation = r.locationId === locationId;
          const matchesType = !locationType || r.locationType === locationType;
          return matchesLocation && matchesType;
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      console.log(`📋 Found ${locationRecalibrations.length} recalibration records`);
    }

    return c.json({ 
      history: locationRecalibrations,
      count: locationRecalibrations.length
    });

  } catch (error: any) {
    console.error('Error fetching recalibration history:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all pending recalibrations for approval (Managers and Cluster Heads only)
app.get('/make-server-c2dd9b9d/stock-recalibration/pending-approval', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    // Filter for pending status (default to 'pending' if no status field)
    const pendingRecalibrations = allRecalibrations
      .filter((r: any) => !r.status || r.status === 'pending')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return c.json({ 
      recalibrations: pendingRecalibrations,
      count: pendingRecalibrations.length
    });

  } catch (error: any) {
    console.error('Error fetching pending recalibrations:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Approve a recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration/:id/approve', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const recalibrationId = c.req.param('id');
    
    // Get the recalibration record
    const recalibration = await kv.get(`recalibration_${recalibrationId}`);
    if (!recalibration) {
      return c.json({ error: 'Recalibration not found' }, 404);
    }

    // Update the record with approval
    const updatedRecalibration = {
      ...recalibration,
      status: 'approved',
      approvedBy: auth.user.id,
      approvedByName: auth.user.user_metadata?.name || auth.user.email,
      approvedAt: new Date().toISOString()
    };

    await kv.set(`recalibration_${recalibrationId}`, updatedRecalibration);

    console.log(`✅ Recalibration ${recalibrationId} approved by ${updatedRecalibration.approvedByName}`);

    return c.json({
      success: true,
      message: 'Recalibration approved successfully',
      recalibration: updatedRecalibration
    });

  } catch (error: any) {
    console.error('Error approving recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Reject a recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration/:id/reject', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const recalibrationId = c.req.param('id');
    const { reason } = await c.req.json();
    
    if (!reason) {
      return c.json({ error: 'Rejection reason is required' }, 400);
    }

    // Get the recalibration record
    const recalibration = await kv.get(`recalibration_${recalibrationId}`);
    if (!recalibration) {
      return c.json({ error: 'Recalibration not found' }, 404);
    }

    // Update the record with rejection
    const updatedRecalibration = {
      ...recalibration,
      status: 'rejected',
      rejectedBy: auth.user.id,
      rejectedByName: auth.user.user_metadata?.name || auth.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };

    await kv.set(`recalibration_${recalibrationId}`, updatedRecalibration);

    console.log(`❌ Recalibration ${recalibrationId} rejected by ${updatedRecalibration.rejectedByName}`);

    return c.json({
      success: true,
      message: 'Recalibration rejected',
      recalibration: updatedRecalibration
    });

  } catch (error: any) {
    console.error('Error rejecting recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get monthly wastage report
app.get('/make-server-c2dd9b9d/stock-recalibration/wastage-report', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const month = c.req.query('month'); // Expected format: "2026-01"
    const locationId = c.req.query('locationId'); // Optional - filter by location
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'
    const role = auth.user.user_metadata?.role;

    if (!month) {
      return c.json({ error: 'Month parameter is required (format: YYYY-MM)' }, 400);
    }

    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    // Filter by month and optionally by location
    let filteredRecalibrations;
    
    // If locationId is "all-cluster-locations", fetch for all managed locations
    if (locationId === 'all-cluster-locations' && role === 'cluster_head') {
      const employeeId = auth.user.user_metadata?.employeeId;
      const employee = await kv.get(`unified-employee:${employeeId}`);
      
      if (employee) {
        const managedStoreIds = employee.managedStoreIds || [];
        const managedProductionHouseIds = employee.managedProductionHouseIds || [];
        const allManagedIds = [...managedStoreIds, ...managedProductionHouseIds];
        
        filteredRecalibrations = allRecalibrations.filter((r: any) => {
          const recalMonth = r.date.substring(0, 7);
          const matchesMonth = recalMonth === month;
          const matchesLocation = allManagedIds.includes(r.locationId);
          const matchesType = !locationType || r.locationType === locationType;
          return matchesMonth && matchesLocation && matchesType;
        });
      } else {
        filteredRecalibrations = [];
      }
    } else {
      // Standard query - ONLY filter by locationId and locationType
      // DO NOT mix production house and store recalibrations
      
      console.log(`📊 Wastage Report Query:
        - Month: ${month}
        - Querying locationId: ${locationId}
        - Filtering by locationType: ${locationType || 'ALL'}`);
      
      filteredRecalibrations = allRecalibrations.filter((r: any) => {
        const recalMonth = r.date.substring(0, 7); // "2026-01"
        if (recalMonth !== month) return false;
        if (locationId && r.locationId !== locationId) return false;
        if (locationType && r.locationType !== locationType) return false;
        return true;
      });
      
      console.log(`📊 Found ${filteredRecalibrations.length} recalibration records for wastage report`);
    }

    // Collect all items with wastage or counting errors
    const wastageItems: any[] = [];
    filteredRecalibrations.forEach((recal: any) => {
      recal.items?.forEach((item: any) => {
        if (item.difference !== 0 && item.adjustmentType) {
          wastageItems.push({
            ...item,
            locationId: recal.locationId,
            locationName: recal.locationName,
            date: recal.date,
            performedBy: recal.performedByName
          });
        }
      });
    });

    // Calculate summary statistics
    const summary = {
      totalRecalibrations: filteredRecalibrations.length,
      uniqueLocations: new Set(filteredRecalibrations.map((r: any) => r.locationId)).size,
      totalWastage: wastageItems.filter(i => i.adjustmentType === 'wastage').length,
      totalCountingErrors: wastageItems.filter(i => i.adjustmentType === 'counting_error').length,
      totalDifferenceValue: wastageItems.reduce((sum, item) => sum + Math.abs(item.difference), 0)
    };

    return c.json({
      month,
      locationId: locationId || 'all',
      summary,
      items: wastageItems,
      recalibrations: filteredRecalibrations.map((r: any) => ({
        id: r.id,
        locationName: r.locationName,
        date: r.date,
        performedBy: r.performedByName,
        itemsWithDifference: r.itemsWithDifference,
        status: r.status || 'pending'
      }))
    });

  } catch (error: any) {
    console.error('Error generating wastage report:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK THRESHOLD SETTINGS
// ============================================

// Get stock thresholds for a store
app.get('/make-server-c2dd9b9d/stock-thresholds/:storeId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const storeId = c.req.param('storeId');
    const thresholds = await kv.get(`stock-thresholds:${storeId}`);
    
    // Return default thresholds if none saved
    if (!thresholds) {
      return c.json({
        thresholds: {
          chicken: { high: 1200, medium: 600, low: 300 },
          chickenCheese: { high: 600, medium: 300, low: 150 },
          veg: { high: 600, medium: 300, low: 150 },
          cheeseCorn: { high: 600, medium: 300, low: 150 },
          paneer: { high: 600, medium: 300, low: 150 },
          vegKurkure: { high: 600, medium: 300, low: 150 },
          chickenKurkure: { high: 600, medium: 300, low: 150 },
        }
      });
    }
    
    return c.json({ thresholds });
  } catch (error: any) {
    console.error('Error fetching stock thresholds:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Save stock thresholds for a store
app.post('/make-server-c2dd9b9d/stock-thresholds/:storeId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const storeId = c.req.param('storeId');
    const { thresholds } = await c.req.json();
    
    // Save thresholds
    await kv.set(`stock-thresholds:${storeId}`, thresholds);
    
    return c.json({ success: true, thresholds });
  } catch (error: any) {
    console.error('Error saving stock thresholds:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// CLUSTER MANAGEMENT ROUTES
// ============================================

// Get cluster head info with managed locations
app.get('/make-server-c2dd9b9d/cluster/info', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can access cluster info' }, 403);
    }

    const employeeId = auth.user.user_metadata?.employeeId;
    if (!employeeId) {
      return c.json({ error: 'Employee ID not found' }, 400);
    }

    // Get the unified employee record which contains cluster mappings
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ 
        managedStoreIds: [], 
        managedProductionHouseIds: [],
        message: 'No cluster assignments found'
      });
    }

    return c.json({
      managedStoreIds: employee.managedStoreIds || [],
      managedProductionHouseIds: employee.managedProductionHouseIds || [],
      employeeId: employee.employeeId,
      name: employee.name
    });

  } catch (error: any) {
    console.error('Error fetching cluster info:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update cluster head assignments (admin/cluster head only)
app.post('/make-server-c2dd9b9d/cluster/update-assignments', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    // Only cluster heads can update their own assignments (self-service)
    // Or future: add admin role for cross-cluster management
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can update cluster assignments' }, 403);
    }

    const { employeeId, managedStoreIds, managedProductionHouseIds } = await c.req.json();

    if (!employeeId) {
      return c.json({ error: 'Employee ID is required' }, 400);
    }

    // Get the existing employee record
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Update with cluster assignments
    const updatedEmployee = {
      ...employee,
      managedStoreIds: managedStoreIds || [],
      managedProductionHouseIds: managedProductionHouseIds || [],
      updatedAt: new Date().toISOString()
    };

    await kv.set(`unified-employee:${employeeId}`, updatedEmployee);

    console.log(`✅ Updated cluster assignments for ${employeeId}:`, {
      stores: managedStoreIds?.length || 0,
      productionHouses: managedProductionHouseIds?.length || 0
    });

    return c.json({
      success: true,
      message: 'Cluster assignments updated successfully',
      employee: updatedEmployee
    });

  } catch (error: any) {
    console.error('Error updating cluster assignments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all cluster heads with their assignments (for management UI)
app.get('/make-server-c2dd9b9d/cluster/all-cluster-heads', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    // Only cluster heads can view all cluster assignments
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can access this endpoint' }, 403);
    }

    // Get all unified employee records
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    // Filter for cluster heads only
    const clusterHeads = allEmployees
      .filter((emp: any) => emp.role === 'cluster_head')
      .map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        email: emp.email,
        managedStoreIds: emp.managedStoreIds || [],
        managedProductionHouseIds: emp.managedProductionHouseIds || [],
        status: emp.status
      }));

    return c.json({
      clusterHeads,
      count: clusterHeads.length
    });

  } catch (error: any) {
    console.error('Error fetching cluster heads:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PUSH NOTIFICATION ROUTES
// ============================================

// Import push notification functions
import * as push from './pushNotifications.tsx';

// Get VAPID public key for client-side subscription
app.get('/make-server-c2dd9b9d/push/vapid-public-key', (c) => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  
  if (!publicKey) {
    // Return success but indicate keys are not configured
    return c.json({ publicKey: null, configured: false });
  }
  
  return c.json({ publicKey, configured: true });
});

// Subscribe to push notifications
app.post('/make-server-c2dd9b9d/push/subscribe', async (c) => {
  try {
    const { subscription, userId } = await c.req.json();
    
    if (!subscription || !userId) {
      return c.json({ error: 'Subscription and userId are required' }, 400);
    }
    
    await push.storeSubscription(userId, subscription);
    
    return c.json({ 
      success: true, 
      message: 'Successfully subscribed to push notifications' 
    });
  } catch (error: any) {
    console.error('Error subscribing to push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Unsubscribe from push notifications
app.post('/make-server-c2dd9b9d/push/unsubscribe', async (c) => {
  try {
    const { userId } = await c.req.json();
    
    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }
    
    await push.removeSubscription(userId);
    
    return c.json({ 
      success: true, 
      message: 'Successfully unsubscribed from push notifications' 
    });
  } catch (error: any) {
    console.error('Error unsubscribing from push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Send push notification to a user (protected route)
app.post('/make-server-c2dd9b9d/push/send', async (c) => {
  try {
    const authResult = await verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) {
      return c.json({ error: authResult.error }, authResult.status);
    }
    
    const { userId, title, message, icon, tag, data } = await c.req.json();
    
    if (!userId || !title || !message) {
      return c.json({ error: 'userId, title, and message are required' }, 400);
    }
    
    const result = await push.sendPushNotification(userId, {
      title,
      message,
      icon,
      tag,
      data,
    });
    
    if (result) {
      return c.json({ success: true, message: 'Push notification sent' });
    } else {
      return c.json({ success: false, message: 'Failed to send push notification' }, 500);
    }
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Send push notification to multiple users (protected route)
app.post('/make-server-c2dd9b9d/push/send-multiple', async (c) => {
  try {
    const authResult = await verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) {
      return c.json({ error: authResult.error }, authResult.status);
    }
    
    const { userIds, title, message, icon, tag, data } = await c.req.json();
    
    if (!userIds || !Array.isArray(userIds) || !title || !message) {
      return c.json({ error: 'userIds (array), title, and message are required' }, 400);
    }
    
    const result = await push.sendPushNotificationToMultipleUsers(userIds, {
      title,
      message,
      icon,
      tag,
      data,
    });
    
    return c.json({ 
      success: true, 
      message: `Sent ${result.success} notifications, ${result.failed} failed`,
      ...result 
    });
  } catch (error: any) {
    console.error('Error sending push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK REQUEST REMINDER NOTIFICATIONS (3PM Daily)
// ============================================
// This endpoint checks for Store Incharges who haven't submitted
// stock requests for today and sends them a reminder notification.
// Can be called manually or via cron job at 3pm daily.
app.post('/make-server-c2dd9b9d/send-stock-request-reminders', async (c) => {
  try {
    console.log('=== STOCK REQUEST REMINDER CHECK (3PM) ===');
    console.log('Timestamp:', new Date().toISOString());
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    console.log('Checking for stock requests on:', today);
    
    // Get all stock requests for today
    const todaysRequests = await kv.getByPrefix('stock-request:');
    const todayRequestStoreIds = todaysRequests
      .filter((req: any) => req.requestDate === today)
      .map((req: any) => req.storeId);
    
    console.log('Stores with requests today:', todayRequestStoreIds.length);
    
    // Get all stores
    const stores = await kv.getByPrefix('store:');
    console.log('Total stores:', stores.length);
    
    // Get all employees
    const employees = await kv.getByPrefix('unified-employee:');
    
    // Find all Store Incharges
    const storeIncharges = employees.filter((emp: any) => emp.designation === 'store_incharge');
    console.log('Total store incharges:', storeIncharges.length);
    
    // Find Store Incharges who haven't submitted requests today
    const reminderTargets: any[] = [];
    
    for (const employee of storeIncharges) {
      const storeId = employee.storeId;
      
      // Skip if no store assigned
      if (!storeId) continue;
      
      // Skip if this store already has a request today
      if (todayRequestStoreIds.includes(storeId)) {
        console.log(`Store ${storeId} already has request - skipping`);
        continue;
      }
      
      // Find the store details
      const store = stores.find((s: any) => s.id === storeId);
      
      // Skip if store doesn't have a production house mapped
      if (!store || !store.productionHouseId) {
        console.log(`Store ${storeId} has no production house - skipping`);
        continue;
      }
      
      // This incharge needs a reminder
      reminderTargets.push({
        employeeId: employee.id,
        userId: employee.userId,
        name: employee.name,
        storeName: store.name,
        storeId: storeId,
      });
    }
    
    console.log('Sending reminders to:', reminderTargets.length, 'store incharges');
    
    // Send notifications to all targets
    let sent = 0;
    let failed = 0;
    
    for (const target of reminderTargets) {
      try {
        const success = await push.sendPushNotification(target.userId, {
          title: '⏰ Stock Request Reminder',
          message: `Hi ${target.name}, you haven't submitted a stock request for ${target.storeName} today. Please submit your request to ensure timely stock delivery.`,
          icon: '/icon-192x192.png',
          tag: 'stock-request-reminder',
          data: {
            type: 'stock-request-reminder',
            storeId: target.storeId,
            date: today,
          },
        });
        
        if (success) {
          sent++;
          console.log(`✓ Sent reminder to ${target.name} (${target.storeName})`);
        } else {
          failed++;
          console.log(`✗ Failed to send reminder to ${target.name} (no subscription)`);
        }
      } catch (error) {
        failed++;
        console.error(`Error sending reminder to ${target.name}:`, error);
      }
    }
    
    console.log(`=== REMINDER SUMMARY: ${sent} sent, ${failed} failed ===`);
    
    return c.json({
      success: true,
      message: `Stock request reminders processed`,
      summary: {
        totalStoreIncharges: storeIncharges.length,
        storesWithRequests: todayRequestStoreIds.length,
        remindersSent: sent,
        remindersFailed: failed,
        targets: reminderTargets.map(t => ({
          name: t.name,
          store: t.storeName,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error sending stock request reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PRODUCTION DATA CLEANUP
// ============================================
// Selective cleanup for production launch - removes ALL transactional data
// while preserving master data (inventory items, employees, stores, etc.)
//
// DELETES:
// - inventory: (purchase logs)
// - overhead: (expense logs) 
// - fixedcost: (fixed cost logs)
// - sales: (sales records)
// - production: (production logs)
// - production-request: (production requests)
// - item-sales: (category sales)
// - notification: (all notifications)
// - stock-request: (stock requests)
// - stock-recalibration: (monthly recalibrations)
//
// PRESERVES:
// - employee: / unified-employee: / attendance-employee: (master data)
// - inventory_item_ (product metadata)
// - store: / production-house: (locations)
// - archived-employee: (historical records)
// - payout: (employee payouts)
// - timesheet: (daily timesheets)
// - leave: (leave applications)
// ============================================

app.post('/make-server-c2dd9b9d/cleanup-production-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run cleanup
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can cleanup production data' }, 403);
    }

    console.log('🗑️ Starting selective production data cleanup...');
    console.log('📅 Removing transactional data for production launch');
    
    const stats = {
      inventory: 0,
      sales: 0,
      itemSales: 0,
      stockRequests: 0,
      stockRecalibrations: 0,
      productionData: 0,
      productionRequests: 0,
      notifications: 0,
      overheads: 0,
      fixedCosts: 0
    };

    // Get all keys from database
    const { data: allRecords, error: fetchError } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key');
    
    if (fetchError) {
      throw new Error(`Failed to fetch keys: ${fetchError.message}`);
    }

    console.log(`📊 Total records in database: ${allRecords?.length || 0}`);

    // Filter and delete transactional data keys
    const keysToDelete: string[] = [];
    
    for (const record of allRecords || []) {
      const key = record.key;
      
      // TRANSACTIONAL DATA TO DELETE
      // These are all daily operations and transactions
      const isTransactional = 
        key.startsWith('inventory:') ||           // Daily inventory purchases
        key.startsWith('overhead:') ||            // Daily overhead expenses
        key.startsWith('fixedcost:') ||           // Fixed costs
        key.startsWith('sales:') ||               // Daily sales data
        key.startsWith('production:') ||          // Production logs
        key.startsWith('item-sales:') ||          // Category sales tracking
        key.startsWith('notification:') ||        // Notifications
        key.startsWith('stock-request:') ||       // Stock requests
        key.startsWith('stock-recalibration:') || // Monthly stock recalibrations
        key.startsWith('production-request:');    // Production requests
      
      // MASTER DATA TO PRESERVE
      // These are configuration and employee records
      const isMasterData = 
        key.startsWith('employee:') ||
        key.startsWith('unified-employee:') ||
        key.startsWith('unified_employee:') ||
        key.startsWith('attendance-employee:') ||
        key.startsWith('attendance-manager:') ||
        key.startsWith('archived-employee:') ||
        key.startsWith('inventory_item_') ||      // Product metadata
        key.startsWith('store:') ||
        key.startsWith('production-house:') ||
        key.startsWith('payout:') ||              // Employee payouts (keep per request)
        key.startsWith('timesheet:') ||           // Timesheets (keep per request)
        key.startsWith('leave:');                 // Leave data (keep per request)
      
      if (isTransactional && !isMasterData) {
        keysToDelete.push(key);
      }
    }

    console.log(`🗑️  Deleting ${keysToDelete.length} transactional records...`);
    
    // Count by type for detailed reporting
    stats.inventory = keysToDelete.filter(k => k.startsWith('inventory:')).length;
    stats.sales = keysToDelete.filter(k => k.startsWith('sales:')).length;
    stats.itemSales = keysToDelete.filter(k => k.startsWith('item-sales:')).length;
    stats.overheads = keysToDelete.filter(k => k.startsWith('overhead:')).length;
    stats.fixedCosts = keysToDelete.filter(k => k.startsWith('fixedcost:')).length;
    stats.stockRequests = keysToDelete.filter(k => k.startsWith('stock-request:')).length;
    stats.stockRecalibrations = keysToDelete.filter(k => k.startsWith('stock-recalibration:')).length;
    stats.productionData = keysToDelete.filter(k => k.startsWith('production:')).length;
    stats.productionRequests = keysToDelete.filter(k => k.startsWith('production-request:')).length;
    stats.notifications = keysToDelete.filter(k => k.startsWith('notification:')).length;

    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      await kv.mdel(batch);
      console.log(`✅ Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(keysToDelete.length / batchSize)}`);
    }

    console.log('✅ Production data cleanup completed!');
    console.log('📊 Summary:', stats);
    console.log('✅ PRESERVED: Inventory Items, Employee Master Data, Payroll, Timesheets, Leaves, Stores, Production Houses');

    return c.json({ 
      success: true, 
      message: 'Production data cleaned successfully. All transactional data removed. Preserved: inventory items metadata, employee master data, payroll, timesheets, leaves, stores, and production houses.',
      stats,
      totalDeleted: keysToDelete.length
    });
  } catch (error) {
    console.error('❌ Error during production cleanup:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Mount inventory items routes
app.route('/', inventoryItemsRoutes);

Deno.serve(app.fetch);
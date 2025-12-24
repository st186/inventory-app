import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

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
  
  return { user };
}

// Signup route
app.post('/make-server-c2dd9b9d/auth/signup', async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();

    if (!email || !password || !role) {
      return c.json({ error: 'Email, password, and role are required' }, 400);
    }

    if (!['manager', 'cluster_head'].includes(role)) {
      return c.json({ error: 'Invalid role. Must be manager or cluster_head' }, 400);
    }

    // Create user with Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role },
      // Automatically confirm the user's email since an email server hasn't been configured
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
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
    const userId = authResult.user.id;
    const items = await kv.getByPrefix(`sales:${userId}:`);
    
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
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can add sales data' }, 403);
    }

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
    
    return c.json({ success: true, item: salesItem });
  } catch (error) {
    console.log('Error adding sales data:', error);
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
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'manager') {
      return c.json({ error: 'Only managers can update sales data' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `sales:${userId}:${itemId}`;
    const updates = await c.req.json();
    
    const salesItem = {
      ...updates,
      id: itemId,
      userId
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
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve sales data' }, 403);
    }

    const itemId = c.req.param('id');
    const key = `sales:${userId}:${itemId}`;
    
    // Get existing sales data
    const existingData = await kv.get(key);
    if (!existingData) {
      return c.json({ error: 'Sales data not found' }, 404);
    }

    const approvedItem = {
      ...existingData,
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

Deno.serve(app.fetch);
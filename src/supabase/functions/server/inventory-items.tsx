import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Retry wrapper for KV operations to handle connection resets
async function retryKvOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3
): Promise<T> {
  const retryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isConnectionError = 
        error?.message?.includes('connection reset') || 
        error?.message?.includes('connection error') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.message?.includes('client error');
      
      if (isConnectionError && attempt < maxRetries) {
        const delay = retryDelay(attempt);
        console.log(`⚠️ Connection error in ${operationName}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If we've exhausted retries or it's a different error, throw it
      console.error(`❌ Error in ${operationName} after ${attempt + 1} attempts:`, error);
      throw error;
    }
  }
  
  throw new Error(`Failed to execute ${operationName} after ${maxRetries} retries`);
}

export interface InventoryItem {
  id: string; // Format: "item_<timestamp>_<random>"
  name: string;
  displayName: string;
  category: 'finished_product' | 'raw_material' | 'sauce_chutney';
  unit: string; // 'pieces', 'kg', 'liters', etc.
  linkedEntityType: 'store' | 'production_house' | 'global'; // Global means available to all
  linkedEntityId?: string; // Store ID or Production House ID if not global
  createdBy: string; // User ID
  createdAt: string;
  isActive: boolean;
}

// Generate unique inventory item ID
function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// GET all inventory items (with optional filtering)
app.get('/make-server-c2dd9b9d/inventory-items', async (c) => {
  try {
    const entityType = c.req.query('entityType'); // 'store' | 'production_house' | 'global'
    const entityId = c.req.query('entityId'); // specific store/production house ID
    const category = c.req.query('category'); // filter by category

    console.log('📦 Fetching inventory items:', { entityType, entityId, category });

    // Get all items with error handling
    let items: InventoryItem[] = [];
    try {
      items = await retryKvOperation(
        () => kv.getByPrefix<InventoryItem>('inventory_item_'),
        'getByPrefix'
      );
      console.log(`📊 Raw items fetched: ${items.length}`);
    } catch (kvError) {
      console.error('❌ KV Store error:', kvError);
      // If no items exist yet, return empty array
      if (kvError.message?.includes('<!DOCTYPE html>') || kvError.message?.includes('500')) {
        console.log('⚠️ Database connection issue or no items exist yet, returning empty array');
        return c.json({ items: [] });
      }
      throw kvError;
    }
    
    let filteredItems = items.filter(item => item.isActive);

    // Filter by entity type and ID
    if (entityType && entityId) {
      filteredItems = filteredItems.filter(item => 
        item.linkedEntityType === entityType && item.linkedEntityId === entityId
      );
    } else if (entityType) {
      filteredItems = filteredItems.filter(item => 
        item.linkedEntityType === entityType
      );
    }

    // Always include global items
    const globalItems = items.filter(item => 
      item.isActive && item.linkedEntityType === 'global'
    );
    filteredItems = [...filteredItems, ...globalItems];

    // Remove duplicates
    filteredItems = Array.from(new Map(filteredItems.map(item => [item.id, item])).values());

    // Filter by category if specified
    if (category) {
      filteredItems = filteredItems.filter(item => item.category === category);
    }

    console.log(`✅ Found ${filteredItems.length} inventory items`);

    return c.json({ items: filteredItems });
  } catch (error) {
    console.error('❌ Error fetching inventory items:', error);
    return c.json({ error: 'Failed to fetch inventory items' }, 500);
  }
});

// GET single inventory item
app.get('/make-server-c2dd9b9d/inventory-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const item = await retryKvOperation(
      () => kv.get<InventoryItem>(`inventory_item_${id}`),
      'get inventory item'
    );

    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    return c.json({ item });
  } catch (error) {
    console.error('❌ Error fetching inventory item:', error);
    return c.json({ error: 'Failed to fetch inventory item' }, 500);
  }
});

// POST create new inventory item
app.post('/make-server-c2dd9b9d/inventory-items', async (c) => {
  try {
    const { name, displayName, category, unit, linkedEntityType, linkedEntityId, userId } = await c.req.json();

    console.log('📦 Creating inventory item:', { name, displayName, category, linkedEntityType, linkedEntityId });

    // Validation
    if (!name || !displayName || !category || !unit || !linkedEntityType) {
      return c.json({ 
        error: 'Missing required fields: name, displayName, category, unit, linkedEntityType' 
      }, 400);
    }

    if (!['finished_product', 'raw_material', 'sauce_chutney'].includes(category)) {
      return c.json({ 
        error: 'Invalid category. Must be: finished_product, raw_material, or sauce_chutney' 
      }, 400);
    }

    if (!['store', 'production_house', 'global'].includes(linkedEntityType)) {
      return c.json({ 
        error: 'Invalid linkedEntityType. Must be: store, production_house, or global' 
      }, 400);
    }

    if (linkedEntityType !== 'global' && !linkedEntityId) {
      return c.json({ 
        error: 'linkedEntityId is required when linkedEntityType is not global' 
      }, 400);
    }

    // Check for duplicate name in same context
    let existingItems: InventoryItem[] = [];
    try {
      existingItems = await retryKvOperation(
        () => kv.getByPrefix<InventoryItem>('inventory_item_'),
        'check duplicate items'
      );
    } catch (kvError) {
      console.log('⚠️ No existing items found (probably first item), skipping duplicate check');
      existingItems = [];
    }
    
    const duplicate = existingItems.find(item => 
      item.isActive &&
      item.name.toLowerCase() === name.toLowerCase() &&
      item.linkedEntityType === linkedEntityType &&
      (linkedEntityType === 'global' || item.linkedEntityId === linkedEntityId)
    );

    if (duplicate) {
      return c.json({ 
        error: 'An item with this name already exists in this context' 
      }, 400);
    }

    const itemId = generateItemId();
    const newItem: InventoryItem = {
      id: itemId,
      name: name.toLowerCase().replace(/\s+/g, '_'), // Normalize name for storage keys
      displayName,
      category,
      unit,
      linkedEntityType,
      linkedEntityId: linkedEntityType === 'global' ? undefined : linkedEntityId,
      createdBy: userId || 'system',
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    await retryKvOperation(
      () => kv.set(`inventory_item_${itemId}`, newItem),
      'create inventory item'
    );

    console.log('✅ Inventory item created:', itemId);

    return c.json({ 
      message: 'Inventory item created successfully',
      item: newItem 
    }, 201);
  } catch (error) {
    console.error('❌ Error creating inventory item:', error);
    return c.json({ error: 'Failed to create inventory item' }, 500);
  }
});

// PUT update inventory item
app.put('/make-server-c2dd9b9d/inventory-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();

    console.log('📦 Updating inventory item:', id, updates);

    const existingItem = await retryKvOperation(
      () => kv.get<InventoryItem>(`inventory_item_${id}`),
      'get inventory item for update'
    );
    
    if (!existingItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const updatedItem: InventoryItem = {
      ...existingItem,
      ...updates,
      id, // Prevent ID from being changed
      createdAt: existingItem.createdAt, // Prevent createdAt from being changed
      createdBy: existingItem.createdBy, // Prevent createdBy from being changed
    };

    await retryKvOperation(
      () => kv.set(`inventory_item_${id}`, updatedItem),
      'update inventory item'
    );

    console.log('✅ Inventory item updated:', id);

    return c.json({ 
      message: 'Inventory item updated successfully',
      item: updatedItem 
    });
  } catch (error) {
    console.error('❌ Error updating inventory item:', error);
    return c.json({ error: 'Failed to update inventory item' }, 500);
  }
});

// DELETE (soft delete) inventory item
app.delete('/make-server-c2dd9b9d/inventory-items/:id', async (c) => {
  try {
    const id = c.req.param('id');

    console.log('📦 Deleting inventory item:', id);

    const existingItem = await retryKvOperation(
      () => kv.get<InventoryItem>(`inventory_item_${id}`),
      'get inventory item for delete'
    );
    
    if (!existingItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    // Soft delete by setting isActive to false
    const updatedItem: InventoryItem = {
      ...existingItem,
      isActive: false,
    };

    await retryKvOperation(
      () => kv.set(`inventory_item_${id}`, updatedItem),
      'delete inventory item'
    );

    console.log('✅ Inventory item deleted (soft):', id);

    return c.json({ 
      message: 'Inventory item deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting inventory item:', error);
    return c.json({ error: 'Failed to delete inventory item' }, 500);
  }
});

// POST initialize default items (run once to populate default momo types)
app.post('/make-server-c2dd9b9d/inventory-items/initialize-defaults', async (c) => {
  try {
    console.log('📦 Initializing default inventory items...');

    const defaultItems: Omit<InventoryItem, 'id' | 'createdAt'>[] = [
      { name: 'chicken', displayName: 'Chicken Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'chicken_cheese', displayName: 'Chicken Cheese Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'veg', displayName: 'Veg Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'cheese_corn', displayName: 'Cheese Corn Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'paneer', displayName: 'Paneer Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'veg_kurkure', displayName: 'Veg Kurkure Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
      { name: 'chicken_kurkure', displayName: 'Chicken Kurkure Momo', category: 'finished_product', unit: 'pieces', linkedEntityType: 'global', createdBy: 'system', isActive: true },
    ];

    const createdItems: InventoryItem[] = [];

    for (const item of defaultItems) {
      const itemId = generateItemId();
      const newItem: InventoryItem = {
        ...item,
        id: itemId,
        createdAt: new Date().toISOString(),
      };
      
      await retryKvOperation(
        () => kv.set(`inventory_item_${itemId}`, newItem),
        'initialize inventory item'
      );
      createdItems.push(newItem);
    }

    console.log(`✅ Initialized ${createdItems.length} default inventory items`);

    return c.json({ 
      message: `Successfully initialized ${createdItems.length} default inventory items`,
      items: createdItems 
    });
  } catch (error) {
    console.error('❌ Error initializing default items:', error);
    return c.json({ error: 'Failed to initialize default items' }, 500);
  }
});

export default app;
# Dynamic Inventory Items Management System

## Overview
The Bhandar-IMS system now supports **dynamic inventory items** with unique ID linking for both stores and production houses. You can add, edit, and manage inventory items beyond the default 7 momo types.

## Features

### 1. **Inventory Items Master Management**
- Centralized management of all inventory items
- Three categories: Finished Products, Raw Materials, Sauces/Chutneys
- Support for multiple units (pieces, kg, liters, grams, ml)
- Entity linking: Global, Store-specific, or Production House-specific

### 2. **Unique ID Linking**
- **Global Items**: Available to all stores and production houses
- **Store-Specific Items**: Linked to a specific store ID
- **Production House-Specific Items**: Linked to a specific production house ID

### 3. **Default Items**
Seven default momo types are pre-configured as global items:
- Chicken Momo
- Chicken Cheese Momo
- Veg Momo
- Cheese Corn Momo
- Paneer Momo
- Veg Kurkure Momo
- Chicken Kurkure Momo

## How to Access

### For Operations Managers / Cluster Heads:
1. Log in to Bhandar-IMS
2. Click on **"Manage Items"** in the navigation bar
3. You'll see the Inventory Items Master page

## How to Use

### Adding a New Item

#### Method 1: From Inventory Items Master (Recommended)
1. Navigate to **Manage Items**
2. Click **"Add New Item"** button
3. Fill in the form:
   - **Display Name**: User-friendly name (e.g., "Schezwan Momo")
   - **Category**: Finished Product / Raw Material / Sauce-Chutney
   - **Unit**: pieces, kg, liters, etc.
   - **Link To**: 
     - **All (Global)**: Available to all entities
     - **Specific Store**: Only for selected store
     - **Specific Production House**: Only for selected production house
4. Click **"Add Item"**

#### Method 2: Quick Add (From Stock Status Pages)
1. Go to Store Stock Analysis or Production House Stock Analysis
2. Look for **"Add New Item"** button
3. Fill in the quick form with item details
4. Item will be automatically linked to that store/production house

### Editing an Item
1. Go to **Manage Items**
2. Find the item card
3. Click the **Edit** (pencil) icon
4. Update the fields
5. Click **"Update Item"**

### Deleting an Item
1. Go to **Manage Items**
2. Find the item card
3. Click the **Delete** (trash) icon
4. Confirm deletion
5. Item will be soft-deleted (marked inactive)

### Filtering Items
Use the filter dropdowns to view:
- **By Category**: Finished Products, Raw Materials, Sauces/Chutneys
- **By Type**: Global, Store Specific, Production House Specific

## Backend API Endpoints

### GET `/inventory-items`
Fetch all inventory items with optional filters
```
Query Parameters:
- entityType: 'store' | 'production_house' | 'global'
- entityId: specific store/production house ID
- category: 'finished_product' | 'raw_material' | 'sauce_chutney'
```

### POST `/inventory-items`
Create a new inventory item
```json
{
  "name": "schezwan_momo",
  "displayName": "Schezwan Momo",
  "category": "finished_product",
  "unit": "pieces",
  "linkedEntityType": "store",
  "linkedEntityId": "store_uuid_here",
  "userId": "creator_id"
}
```

### PUT `/inventory-items/:id`
Update an existing item

### DELETE `/inventory-items/:id`
Soft delete an item (sets isActive = false)

### POST `/inventory-items/initialize-defaults`
Initialize the 7 default momo types (run once)

## Data Structure

### InventoryItem Interface
```typescript
{
  id: string;                    // Format: "item_<timestamp>_<random>"
  name: string;                  // Normalized name (lowercase, underscores)
  displayName: string;           // User-friendly display name
  category: string;              // finished_product | raw_material | sauce_chutney
  unit: string;                  // pieces, kg, liters, grams, ml
  linkedEntityType: string;      // store | production_house | global
  linkedEntityId?: string;       // UUID of store or production house (if not global)
  createdBy: string;             // User ID who created the item
  createdAt: string;             // ISO timestamp
  isActive: boolean;             // Soft delete flag
}
```

## Integration Points

### Store Stock Analysis
- Items linked to a specific store will appear in that store's stock calculations
- Global items appear in all stores
- Store managers can add store-specific items via Quick Add

### Production House Stock Analysis
- Items linked to a specific production house appear in production tracking
- Global items appear in all production houses
- Production managers can add production-house-specific items via Quick Add

### Production Management
- When logging production, available items are shown based on the production house
- New items can be added on-the-fly

### Sales Tracking
- Sales can be tracked for any finished product item
- Store-specific items allow better sales analysis per store

## Best Practices

1. **Use Global Items** for products sold across all locations
2. **Use Store-Specific Items** for location-specific variants or test products
3. **Use Production House-Specific Items** for items produced only at certain facilities
4. **Consistent Naming**: Use clear, descriptive names
5. **Proper Units**: Choose appropriate units for accurate tracking
6. **Regular Review**: Periodically review and archive unused items

## Troubleshooting

### Items Not Showing Up
- Check filters - ensure you're viewing the correct category/type
- Verify the item is marked as active
- For store/production house pages, ensure item is linked to that entity or marked as global

### Duplicate Item Error
- An item with the same name already exists in that context
- Check if it already exists before creating
- Use a different name or edit the existing item

### Cannot Delete Default Items
- Default items (7 momo types) can be deleted like any other item
- They can be re-initialized using the "Initialize Defaults" button

## Future Enhancements

### Planned Features:
- Bulk import/export of inventory items
- Item history and audit logs
- Item images and descriptions
- Stock threshold settings per item
- Category customization
- Multi-language support for item names

## Support

For issues or questions about inventory items management:
1. Check this documentation
2. Contact your system administrator
3. Review the in-app help tooltips

---

**Version**: 1.0
**Last Updated**: January 2026
**Feature Status**: ✅ Active and Production-Ready

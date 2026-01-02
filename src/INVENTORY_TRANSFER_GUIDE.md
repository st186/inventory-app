# Production House Inventory Transfer Guide

## Overview
This guide explains how to transfer inventory between production houses in the Bhandar-IMS system.

## Transfer Functionality

### What It Does
The inventory transfer feature allows you to move all stock from one production house to another. This is useful when:
- Consolidating inventory from multiple locations
- Correcting inventory assignments
- Migrating stock to a new production house

### How It Works
1. **Source Production House**: All inventory is removed (set to zero)
2. **Destination Production House**: Receives all inventory from source (added to existing stock)
3. **Transaction**: Atomic operation - both updates happen together

## Using the Transfer Feature

### Step 1: Navigate to Production House Management
1. Log in as Cluster Head
2. Go to **Assets** tab
3. Select **Production Houses** sub-tab

### Step 2: Initiate Transfer
1. Click the **"Transfer Inventory"** button (blue button in the header)
2. You'll be prompted for two pieces of information:
   - **Source Production House ID** (FROM which house)
   - **Destination Production House ID** (TO which house)

### Step 3: Find Production House IDs
To find the IDs:
1. Look at the production house cards on the page
2. Each card shows the ID next to the **ID:** label
3. Copy the exact UUID (e.g., `578d581a-5e61-42d1-bf00-382f0adf60ad`)

### Step 4: Confirm Transfer
1. Enter the source ID when prompted
2. Enter the destination ID when prompted
3. Confirm the transfer in the confirmation dialog
4. Wait for success message

## For Your Specific Case

You mentioned wanting to import stock levels to:
- **Target ID**: `578d581a-5e61-42d1-bf00-382f0adf60ad`
- **Old ID**: `edd91f27-be81-4b90-b7a6-daee14519589`

### Steps:
1. Click **"Transfer Inventory"** button
2. When prompted "Enter source Production House ID":
   - Enter: `edd91f27-be81-4b90-b7a6-daee14519589`
3. When prompted "Enter destination Production House ID":
   - Enter: `578d581a-5e61-42d1-bf00-382f0adf60ad`
4. Confirm the transfer
5. The stock will be moved to the new production house

## Important Notes

⚠️ **Warning**: This operation cannot be undone automatically. Make sure you have the correct IDs before confirming.

✅ **Safety**: The transfer validates that both production houses exist before proceeding.

📊 **Inventory Types Transferred**:
- Chicken Momos
- Chicken Cheese Momos
- Veg Momos
- Cheese Corn Momos
- Paneer Momos
- Veg Kurkure Momos
- Chicken Kurkure Momos

## API Endpoint
If you need to call this programmatically:

```
POST /make-server-c2dd9b9d/production-houses/transfer-inventory
Body: {
  "fromHouseId": "edd91f27-be81-4b90-b7a6-daee14519589",
  "toHouseId": "578d581a-5e61-42d1-bf00-382f0adf60ad"
}
```

## Troubleshooting

### Error: "Production house not found"
- Double-check the IDs are correct
- Make sure you're using the full UUID
- Verify the production houses exist in the system

### Error: "Not authenticated"
- Make sure you're logged in as a Cluster Head
- Try refreshing the page and logging in again

### Transfer didn't work
- Check the browser console for error messages
- Verify both production houses exist in the list
- Ensure you have proper permissions

## After Transfer
After a successful transfer:
1. The page will automatically refresh production houses
2. Check the inventory levels on both production house cards
3. The source house should show 0 for all inventory
4. The destination house should show the combined totals

# 🎯 Quick Answer: Where Are The Inventory Items Buttons?

## 🚀 TL;DR - How to Get There

1. **Log in** as Operations Manager or Cluster Head
2. **Look at the top navigation bar**
3. **Click on "📦 Manage Items"** button
4. You're there! 🎉

---

## 📍 Step-by-Step with Screenshots Description

### Step 1: Find the Navigation Button

**Desktop View:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Bhandar-IMS                                           [≡ Menu]       │
├──────────────────────────────────────────────────────────────────────┤
│  [Analytics] [Inventory] [Sales] [Production] [Stock Requests]       │
│  [Advanced Inventory] [📦 Manage Items] [Payroll] [Logout]           │
│                        ^^^^^^^^^^^^^^^^^^^                            │
│                        CLICK HERE!                                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Mobile View:**
```
1. Tap the hamburger menu (☰) in top-right corner
2. Scroll down in the menu
3. Find "📦 Manage Items"
4. Tap it
```

---

### Step 2: Once You're on the Page

You'll see a page titled **"Inventory Items Master"** with these buttons:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Inventory Items Master                                             │
│  Manage all inventory items for stores and production houses        │
│                                                                      │
│                         [Initialize Defaults]  [+ Add New Item]     │
│                                ↑                        ↑            │
│                         (First time only)        (Main button)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔘 All Available Buttons & What They Do

### Button 1: "Initialize Defaults" 
**When shown:** Only when you have 0 items  
**What it does:** Adds 7 default momo types  
**API:** `POST /inventory-items/initialize-defaults`

### Button 2: "+ Add New Item"
**When shown:** Always  
**What it does:** Opens form to create new item  
**API:** `POST /inventory-items`

### Button 3: Edit (Pencil Icon ✏️)
**Where:** On each item card  
**What it does:** Edit existing item  
**API:** `PUT /inventory-items/<id>`

### Button 4: Delete (Trash Icon 🗑️)
**Where:** On each item card  
**What it does:** Soft delete item  
**API:** `DELETE /inventory-items/<id>`

### Button 5: Filter Dropdowns
**Where:** Below header  
**What it does:** Filter items by category/type  
**API:** Uses `GET /inventory-items` with query params

---

## 📋 Complete API to UI Mapping

| What You Want To Do | API Endpoint | Where's the Button? |
|---------------------|--------------|---------------------|
| **View all items** | `GET /inventory-items` | Automatic on page load |
| **Filter by category** | `GET /inventory-items?category=finished_product` | Use "Category" dropdown |
| **Filter by entity** | `GET /inventory-items?entityType=store&entityId=<id>` | Use "Entity Type" dropdown |
| **Create new item** | `POST /inventory-items` | Click "+ Add New Item" button (top-right) |
| **Edit item** | `PUT /inventory-items/<id>` | Click pencil icon (✏️) on item card |
| **Delete item** | `DELETE /inventory-items/<id>` | Click trash icon (🗑️) on item card |
| **Add 7 defaults** | `POST /inventory-items/initialize-defaults` | Click "Initialize Defaults" (only shows when 0 items) |

---

## 🎨 Visual Layout of the Page

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Inventory Items Master                                             │
│  Manage all inventory items...                                      │
│                                                                      │
│                         [Initialize Defaults]  [+ Add New Item]  ←──┐
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Filters:  [Category Dropdown ▼]  [Entity Type Dropdown ▼]  ←──────┤
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Statistics ─────────────────────────────────────────────┐      │
│  │  Total: 12  │  Global: 7  │  Store: 3  │  Production: 2 │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Items List:                                                         │
│                                                                      │
│  ┌─────────────────────────────────────────────────┐               │
│  │  🥟 Chicken Momos                   [✏️] [🗑️]  │  ←── Buttons   │
│  │  Category: Finished Product                     │               │
│  │  Unit: pieces                                    │               │
│  │  Scope: 🌐 Global                                │               │
│  └─────────────────────────────────────────────────┘               │
│                                                                      │
│  ┌─────────────────────────────────────────────────┐               │
│  │  🥬 Flour (Maida)                   [✏️] [🗑️]  │               │
│  │  Category: Raw Material                          │               │
│  │  Unit: kg                                        │               │
│  │  Scope: 🏪 Downtown Store                        │               │
│  └─────────────────────────────────────────────────┘               │
│                                                                      │
│  ... more items ...                                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 💡 Example Workflows

### Workflow 1: First Time Setup (Add 7 Default Momos)

```
1. Navigate to: Main Menu → "📦 Manage Items"
2. Click: "Initialize Defaults" button (top-right)
3. Confirm: Click "OK" in popup
4. Done! 7 items created ✅
```

**Behind the scenes:**
```bash
POST /inventory-items/initialize-defaults
→ Creates: chicken, chickenCheese, veg, cheeseCorn, paneer, vegKurkure, chickenKurkure
```

---

### Workflow 2: Add a Custom Item (e.g., Schezwan Momo)

```
1. Navigate to: Main Menu → "📦 Manage Items"
2. Click: "+ Add New Item" button (top-right)
3. Fill form:
   - Display Name: "Schezwan Momo"
   - Category: Finished Product
   - Unit: pieces
   - Link To: Specific Store → Select "Downtown Store"
4. Click: "Save Item"
5. Done! Item created ✅
```

**Behind the scenes:**
```bash
POST /inventory-items
Body: {
  "name": "schezwan_momo",
  "displayName": "Schezwan Momo",
  "category": "finished_product",
  "unit": "pieces",
  "linkedEntityType": "store",
  "linkedEntityId": "<store_uuid>",
  "userId": "<user_id>"
}
```

---

### Workflow 3: Edit an Existing Item

```
1. Navigate to: Main Menu → "📦 Manage Items"
2. Find the item (use filters if needed)
3. Click: Pencil icon (✏️) on the item card
4. Update any fields
5. Click: "Save Item"
6. Done! Item updated ✅
```

**Behind the scenes:**
```bash
PUT /inventory-items/<item_id>
Body: { updated fields }
```

---

### Workflow 4: Delete an Item

```
1. Navigate to: Main Menu → "📦 Manage Items"
2. Find the item
3. Click: Trash icon (🗑️) on the item card
4. Confirm: Click "OK" in popup
5. Done! Item deleted ✅ (soft delete)
```

**Behind the scenes:**
```bash
DELETE /inventory-items/<item_id>
→ Sets isActive: false (soft delete)
```

---

### Workflow 5: Filter Items

```
1. Navigate to: Main Menu → "📦 Manage Items"
2. Use dropdowns to filter:
   - Category: Select "Finished Products"
   - Entity Type: Select "Store-Specific"
3. View filtered results
```

**Behind the scenes:**
```bash
GET /inventory-items
→ Client-side filtering by category and entityType
```

---

## 🔐 Access Control

**Who can access "Manage Items" page?**
- ✅ Operations Manager
- ✅ Cluster Head
- ❌ Store Incharge
- ❌ Production Incharge
- ❌ Employee

**If you don't see the button:**
- Check if you're logged in as Operations Manager or Cluster Head
- The button won't appear for other roles

---

## 🐛 Troubleshooting

### Problem: "I don't see the 'Manage Items' button"
**Solution:**
- Make sure you're logged in as Operations Manager or Cluster Head
- Check the navigation bar carefully - it's between "Advanced Inventory" and "Payroll"
- On mobile, open the hamburger menu and scroll down

### Problem: "Initialize Defaults button is not showing"
**Solution:**
- This button only appears when you have **0 items**
- If you already have items, the button is hidden
- This is intentional to prevent duplicate initialization

### Problem: "I created an item but can't find it"
**Solution:**
- Check your filter settings (Category and Entity Type dropdowns)
- Make sure the item wasn't deleted (check if isActive: true)
- Try setting both filters to "All"

### Problem: "Can't edit or delete items"
**Solution:**
- Make sure you're still logged in
- Check browser console for errors
- Try refreshing the page

---

## 📊 What Each Button Does in Detail

### "Initialize Defaults" Button

**Full Details:**
- **Appears:** Only when items.length === 0
- **Color:** Blue gradient (blue-500 to blue-600)
- **Confirmation:** Shows browser confirm() popup
- **Creates:** 7 global items
  1. Chicken Momos (chicken)
  2. Chicken Cheese Momos (chickenCheese)
  3. Veg Momos (veg)
  4. Cheese Corn Momos (cheeseCorn)
  5. Paneer Momos (paneer)
  6. Veg Kurkure Momos (vegKurkure)
  7. Chicken Kurkure Momos (chickenKurkure)
- **After success:** Reloads items list, shows success message
- **If error:** Shows error message in red banner

---

### "+ Add New Item" Button

**Full Details:**
- **Appears:** Always visible
- **Color:** Purple-pink gradient (purple-600 to pink-600)
- **Opens:** Modal form with fields:
  - Display Name (text input)
  - Category (dropdown: finished_product, raw_material, sauce_chutney)
  - Unit (dropdown: pieces, kg, liters, grams, ml)
  - Link To (dropdown: global, store, production_house)
    - If store/production: Shows entity selector
- **Form Actions:**
  - "Cancel" button → Closes form
  - "Save Item" button → Submits form, creates item
- **Validation:** Checks required fields before submitting

---

### Edit Button (Pencil Icon)

**Full Details:**
- **Appears:** On every item card, top-right
- **Icon:** ✏️ (Edit2 from lucide-react)
- **Color:** Purple (text-purple-600)
- **Opens:** Same form as "Add New Item" but pre-filled
- **Pre-fills:** All existing item data
- **Submit:** Updates item instead of creating new

---

### Delete Button (Trash Icon)

**Full Details:**
- **Appears:** On every item card, top-right
- **Icon:** 🗑️ (Trash2 from lucide-react)
- **Color:** Red (text-red-600)
- **Confirmation:** Shows browser confirm() popup
- **Action:** Soft deletes (sets isActive: false)
- **Does NOT:** Permanently remove from database
- **After success:** Removes item from display, shows success message

---

## 🎓 Advanced: Direct API Access

If you want to call the APIs directly (for testing or automation):

### Get All Items
```bash
curl -X GET \
  "https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items" \
  -H "Authorization: Bearer <publicAnonKey>"
```

### Create Item
```bash
curl -X POST \
  "https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items" \
  -H "Authorization: Bearer <publicAnonKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "schezwan_momo",
    "displayName": "Schezwan Momo",
    "category": "finished_product",
    "unit": "pieces",
    "linkedEntityType": "global",
    "userId": "your-user-id"
  }'
```

### Update Item
```bash
curl -X PUT \
  "https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/<item-id>" \
  -H "Authorization: Bearer <publicAnonKey>" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Schezwan Momo (Updated)"
  }'
```

### Delete Item
```bash
curl -X DELETE \
  "https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/<item-id>" \
  -H "Authorization: Bearer <publicAnonKey>"
```

### Initialize Defaults
```bash
curl -X POST \
  "https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items/initialize-defaults" \
  -H "Authorization: Bearer <publicAnonKey>"
```

---

## 📚 Related Documentation

- **Full User Guide:** `/INVENTORY_ITEMS_GUIDE.md`
- **Technical Docs:** `/DYNAMIC_INVENTORY_IMPLEMENTATION_SUMMARY.md`
- **UI Guide:** `/INVENTORY_ITEMS_UI_GUIDE.md`
- **API Docs:** `/API_DOCUMENTATION.md`

---

**Last Updated:** January 2, 2026  
**Version:** 1.0  
**Status:** ✅ Complete & Production Ready

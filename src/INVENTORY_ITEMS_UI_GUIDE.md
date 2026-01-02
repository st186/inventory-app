# 🎯 Inventory Items UI - Button Locations Guide

## 📍 How to Access the Inventory Items Management Page

### Step 1: Log in as Operations Manager or Cluster Head
Only these roles can access the Inventory Items Management feature.

### Step 2: Find "Manage Items" in Navigation
The "Manage Items" button is located in the main navigation bar:

**Desktop Navigation (Top Bar):**
```
[Analytics] [Inventory] [Sales] [Production] [Stock Requests] 
[Advanced Inventory] [📦 Manage Items] [Payroll] [Attendance] [Export] [Logout]
                     ^^^^^^^^^^^^^^^^^^
                     Click here!
```

**Mobile Navigation (Menu Button):**
1. Click hamburger menu (☰) in top-right
2. Scroll down to find "📦 Manage Items"
3. Click it

---

## 🎨 Buttons Available on the Inventory Items Management Page

Once you're on the **Inventory Items Management** page, you'll see these buttons:

### 1️⃣ **Initialize Defaults** Button
**Location:** Top-right corner (only shows if you have 0 items)

**What it does:**
- Creates the 7 default momo types as global items
- One-time setup button
- Calls: `POST /inventory-items/initialize-defaults`

**Visual:**
```
┌────────────────────────────────────────────────────┐
│  Inventory Items Master                            │
│  Manage all inventory items...                     │
│                                                     │
│                     [Initialize Defaults] [+ Add]  │ ← Here
└────────────────────────────────────────────────────┘
```

**What happens:**
- Adds these 7 items automatically:
  - Chicken Momos
  - Chicken Cheese Momos
  - Veg Momos
  - Cheese Corn Momos
  - Paneer Momos
  - Veg Kurkure Momos
  - Chicken Kurkure Momos

---

### 2️⃣ **Add New Item** Button
**Location:** Top-right corner (always visible)

**What it does:**
- Opens a form to create a new inventory item
- Calls: `POST /inventory-items`

**Visual:**
```
┌────────────────────────────────────────────────────┐
│  Inventory Items Master                            │
│                                                     │
│                              [+ Add New Item]      │ ← Click here
└────────────────────────────────────────────────────┘
```

**Form Fields:**
- **Display Name:** User-friendly name (e.g., "Schezwan Momo")
- **Category:** 
  - 🥟 Finished Product
  - 🥬 Raw Material
  - 🌶️ Sauces & Chutneys
- **Unit:** pieces, kg, liters, grams, ml
- **Link To:**
  - 🌐 Global (all stores/production houses)
  - 🏪 Specific Store (select from dropdown)
  - 🏭 Specific Production House (select from dropdown)

---

### 3️⃣ **Edit Button** (Pencil Icon)
**Location:** On each item card, top-right corner

**What it does:**
- Opens the form pre-filled with item data
- Allows you to update the item
- Calls: `PUT /inventory-items/<item_id>`

**Visual:**
```
┌─────────────────────────────────────┐
│  🥟 Chicken Momos          [✏️] [🗑️] │ ← Edit button
│  Category: Finished Product         │
│  Unit: pieces                        │
│  Scope: 🌐 Global                    │
└─────────────────────────────────────┘
```

---

### 4️⃣ **Delete Button** (Trash Icon)
**Location:** On each item card, top-right corner (next to edit)

**What it does:**
- Soft deletes the item (sets isActive: false)
- Asks for confirmation first
- Calls: `DELETE /inventory-items/<item_id>`

**Visual:**
```
┌─────────────────────────────────────┐
│  🥟 Chicken Momos          [✏️] [🗑️] │ ← Delete button
│  Category: Finished Product         │
└─────────────────────────────────────┘
```

**Note:** Deleted items are not permanently removed, just hidden.

---

### 5️⃣ **Filter Buttons**
**Location:** Below the header, filter section

**What it does:**
- Filters displayed items by category and entity type
- Client-side filtering (no API call)

**Visual:**
```
┌────────────────────────────────────────────────────┐
│  Filter by:  [Category ▼]  [Entity Type ▼]        │
│             All Categories  All Types              │
└────────────────────────────────────────────────────┘
```

**Category Options:**
- All Categories
- Finished Products
- Raw Materials
- Sauces & Chutneys

**Entity Type Options:**
- All Types
- Global
- Store-Specific
- Production House-Specific

---

### 6️⃣ **Save/Cancel Buttons** (in Add/Edit Form)
**Location:** Inside the form modal

**What they do:**
- **Save:** Submits the form (creates or updates item)
- **Cancel:** Closes the form without saving

**Visual:**
```
┌─────────────────────────────────────┐
│  Add New Inventory Item             │
│                                     │
│  Display Name: [___________]       │
│  Category:     [dropdown]          │
│  Unit:         [dropdown]          │
│  Link To:      [dropdown]          │
│                                     │
│           [Cancel]  [Save Item]     │ ← Action buttons
└─────────────────────────────────────┘
```

---

## 🔍 API Endpoint to Button Mapping

| API Endpoint | Button/UI Element | Location |
|-------------|-------------------|----------|
| `GET /inventory-items` | Auto-loads on page | Page load |
| `GET /inventory-items?category=finished_product` | Category filter | Filter dropdown |
| `GET /inventory-items?entityType=store&entityId=<id>` | Entity type filter | Filter dropdown |
| `POST /inventory-items` | "Add New Item" button | Top-right |
| `PUT /inventory-items/<id>` | Edit button (pencil icon) | On item card |
| `DELETE /inventory-items/<id>` | Delete button (trash icon) | On item card |
| `POST /inventory-items/initialize-defaults` | "Initialize Defaults" | Top-right (when 0 items) |

---

## 📊 Statistics Dashboard

**Location:** Below filters, shows automatically

**Displays:**
- Total Active Items
- Global Items count
- Store-Specific Items count
- Production House-Specific Items count

**Visual:**
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Total Items  │ Global Items │ Store Items  │ Prod. Items  │
│     12       │      7       │      3       │      2       │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 🎯 Quick Start Workflow

### First Time Setup:
1. **Go to:** Main navigation → "📦 Manage Items"
2. **Click:** "Initialize Defaults" button (top-right)
3. **Confirm:** Popup asks "Add 7 default momo types?"
4. **Done:** 7 default items created ✅

### Adding Custom Items:
1. **Go to:** Main navigation → "📦 Manage Items"
2. **Click:** "+ Add New Item" button (top-right)
3. **Fill form:**
   - Display Name: "Schezwan Momo"
   - Category: Finished Product
   - Unit: pieces
   - Link To: Store → Select "Downtown Store"
4. **Click:** "Save Item"
5. **Done:** New item created ✅

### Editing Items:
1. **Go to:** Main navigation → "📦 Manage Items"
2. **Find item:** Use filters if needed
3. **Click:** Pencil icon (✏️) on item card
4. **Update:** Change any field
5. **Click:** "Save Item"
6. **Done:** Item updated ✅

### Deleting Items:
1. **Go to:** Main navigation → "📦 Manage Items"
2. **Find item:** Locate the item to delete
3. **Click:** Trash icon (🗑️) on item card
4. **Confirm:** Popup asks "Are you sure?"
5. **Done:** Item deleted (soft delete) ✅

---

## 🚨 Common Issues

### "I don't see the 'Manage Items' button"
**Solution:** You must be logged in as:
- Operations Manager, OR
- Cluster Head

Employees and Incharges cannot access this page.

### "Initialize Defaults button is not showing"
**Solution:** The button only appears when you have **0 items**. If you already have items, it's hidden.

### "Can't find an item I created"
**Solution:** 
1. Check your filter settings
2. Make sure the item is active (not deleted)
3. Check if you're filtering by wrong category/entity type

---

## 💡 Pro Tips

### Tip 1: Use Filters Efficiently
- Filter by "Finished Products" to see only sellable items
- Filter by "Store-Specific" to see location-based items

### Tip 2: Naming Convention
- Use clear, descriptive names
- Examples: "Chicken Momo", "Schezwan Sauce", "Flour (Maida)"

### Tip 3: Link Items Smartly
- **Global items:** Standard products available everywhere
- **Store-specific:** Regional specialties, test items
- **Production house-specific:** Facility-specific recipes

### Tip 4: Don't Delete, Edit
- Instead of deleting and recreating, edit existing items
- Soft delete keeps historical data intact

---

## 📸 Visual Summary

```
Navigation Bar
─────────────────────────────────────────────────────
[Analytics] [Inventory] ... [📦 Manage Items] ← Click here!


Inventory Items Management Page
─────────────────────────────────────────────────────
  Inventory Items Master                              
  Manage all inventory items...                       
                                                      
                      [Initialize Defaults] [+ Add New Item]
                            ↑                    ↑
                     (First time only)      (Always visible)

  Filter by: [Category ▼] [Entity Type ▼]
             ↑                ↑
        (Filter items)  (Filter scope)

  ┌─ Statistics ────────────────────────────────────┐
  │  Total: 12  │  Global: 7  │  Store: 3  │ etc.  │
  └──────────────────────────────────────────────────┘

  ┌─ Item Cards ─────────────────────────────────────┐
  │  🥟 Chicken Momos               [✏️] [🗑️]         │
  │  Category: Finished Product        ↑    ↑        │
  │  Unit: pieces                    Edit  Delete    │
  │  Scope: 🌐 Global                                │
  └──────────────────────────────────────────────────┘
```

---

**Need more help?** Check the full guide at `/INVENTORY_ITEMS_GUIDE.md`

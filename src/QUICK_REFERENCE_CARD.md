# 🎯 Inventory Items - Quick Reference Card

## 🚀 How to Access
**Navigation:** Main Menu → "📦 Manage Items" button

**Access Level:** Operations Manager & Cluster Head only

---

## 🔘 Button Locations

| Button | Location | Function | API Call |
|--------|----------|----------|----------|
| **Initialize Defaults** | Top-right (when 0 items) | Add 7 momo types | `POST /initialize-defaults` |
| **+ Add New Item** | Top-right (always) | Create new item | `POST /inventory-items` |
| **✏️ Edit** | On each card | Update item | `PUT /inventory-items/:id` |
| **🗑️ Delete** | On each card | Soft delete | `DELETE /inventory-items/:id` |
| **Category Filter** | Below header | Filter by category | Client-side |
| **Entity Filter** | Below header | Filter by scope | Client-side |

---

## 📝 Quick Actions

### First Time Setup
```
1. Click "Initialize Defaults"
2. Confirm popup
3. Done! 7 items added ✅
```

### Add Custom Item
```
1. Click "+ Add New Item"
2. Fill: Name, Category, Unit, Scope
3. Click "Save Item"
4. Done! Item created ✅
```

### Edit Item
```
1. Find item (use filters)
2. Click ✏️ pencil icon
3. Update fields
4. Click "Save Item"
5. Done! Updated ✅
```

### Delete Item
```
1. Find item
2. Click 🗑️ trash icon
3. Confirm popup
4. Done! Deleted ✅
```

---

## 📦 Item Properties

| Field | Options | Description |
|-------|---------|-------------|
| **Display Name** | Any text | User-friendly name |
| **Category** | Finished Product<br>Raw Material<br>Sauce/Chutney | Item type |
| **Unit** | pieces, kg, liters, grams, ml | Measurement unit |
| **Link To** | Global<br>Specific Store<br>Specific Production House | Availability scope |

---

## 🎨 Category Colors

- 🥟 **Finished Product** → Purple badge
- 🥬 **Raw Material** → Blue badge
- 🌶️ **Sauce/Chutney** → Orange badge

---

## 🔍 Filters

### Category Filter
- All Categories
- Finished Products only
- Raw Materials only
- Sauces & Chutneys only

### Entity Type Filter
- All Types
- Global items only
- Store-Specific only
- Production House-Specific only

---

## ⚠️ Common Issues

| Problem | Solution |
|---------|----------|
| Can't see "Manage Items" | Must be Manager/Cluster Head |
| No "Initialize Defaults" | Already have items (button hidden) |
| Can't find item | Check filter settings |
| Item won't save | Check required fields |

---

## 💡 Pro Tips

1. **Use Global for standard items** (available everywhere)
2. **Use Store-Specific for regional items** (local specialties)
3. **Use Production House-Specific for facility items** (unique recipes)
4. **Filter before editing** to find items quickly
5. **Don't delete, edit instead** (keeps history intact)

---

## 📊 Default Items (7 Momos)

When you click "Initialize Defaults", these are created:

1. Chicken Momos
2. Chicken Cheese Momos
3. Veg Momos
4. Cheese Corn Momos
5. Paneer Momos
6. Veg Kurkure Momos
7. Chicken Kurkure Momos

All as **Global** items with **pieces** unit.

---

## 🔗 API Endpoints Cheat Sheet

```
GET    /inventory-items              # Fetch all
GET    /inventory-items?category=X   # Filter by category
GET    /inventory-items?entityType=Y # Filter by entity
POST   /inventory-items              # Create
PUT    /inventory-items/:id          # Update
DELETE /inventory-items/:id          # Delete (soft)
POST   /initialize-defaults          # Add 7 defaults
```

**Base URL:** `https://<projectId>.supabase.co/functions/v1/make-server-c2dd9b9d`

**Auth Header:** `Authorization: Bearer <publicAnonKey>`

---

## 📱 Mobile Access

1. Tap **hamburger menu** (☰) in top-right
2. Scroll to **"📦 Manage Items"**
3. Tap to open

---

## 🎯 Keyboard Shortcuts (Future)

*Currently no keyboard shortcuts implemented*

Suggested for future:
- `Ctrl+N` or `Cmd+N` → New Item
- `Ctrl+F` or `Cmd+F` → Focus on filters
- `Escape` → Close form/modal

---

## 📞 Need Help?

**Full Guides:**
- `/INVENTORY_ITEMS_GUIDE.md` - Complete user guide
- `/WHERE_ARE_THE_BUTTONS.md` - Detailed button locations
- `/INVENTORY_ITEMS_UI_GUIDE.md` - UI walkthrough
- `/DYNAMIC_INVENTORY_IMPLEMENTATION_SUMMARY.md` - Technical docs

**In-App Help:**
- Look for help icons (❓) on the page
- Hover tooltips on buttons (future feature)

---

**Print this card for quick reference!**  
Version 1.0 | Updated: Jan 2, 2026

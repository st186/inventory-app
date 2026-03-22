# Bhandar-IMS Terminology Guide

## Understanding the Different Types of Data in the System

This guide clarifies the terminology used in console logs and throughout the codebase to avoid confusion.

---

## 📦 Inventory Items (Purchase Records)

**What they are:**
- Raw materials and ingredients purchased for the business
- Examples: flour, chicken, vegetables, packaging materials

**Where you see them:**
- Console log: `"📦 Loaded Inventory Purchase Records (Raw Materials)"`
- Appears when: Page loads/refreshes
- Added via: "Add Inventory Item" button in Inventory Management page

**Data stored:**
- Item name
- Quantity purchased
- Total cost
- Cost per unit
- Supplier information
- Payment method (cash/online/both)

---

## 💰 Overhead Items (Expenses)

**What they are:**
- Operating expenses and overhead costs
- Examples: fuel, travel, marketing, repairs, personal expenses

**Where you see them:**
- Console log: `"🔧 Loaded Overhead/Expense Items"`
- Appears when: Page loads/refreshes or when adding/editing expenses
- Added via: "Add Overhead Cost" button in Inventory Management page

**Data stored:**
- Expense category (fuel, travel, etc.)
- Description
- Amount
- Payment method (cash/online/both)
- Employee details (for personal_expense category)
- Expense month mapping (for backlogged salaries)

---

## 🔧 Fixed Cost Items

**What they are:**
- Regular monthly fixed costs
- Examples: rent, salaries, subscriptions

**Where you see them:**
- Console log: `"🔧 Loaded Fixed Cost Items"`
- Appears when: Page loads/refreshes
- Added via: "Add Fixed Cost" button in Inventory Management page

**Data stored:**
- Cost category
- Description
- Monthly amount
- Payment method

---

## Why This Matters

When you see console logs during page load like:

```
📦 Loaded Inventory Purchase Records (Raw Materials): 150
🔧 Loaded Overhead/Expense Items: 45
🔧 Loaded Fixed Cost Items: 12
```

**This is normal!** The system loads all data types on startup to display them throughout the app.

### When Adding an Expense

When you add an expense (overhead item), you'll see:
```
💰 Adding Expense/Overhead item: fuel, Diesel for delivery vehicle
🔵 POST /overheads - Adding Expense/Overhead Request received
💰 Expense/Overhead item data received: {...}
✅ Expense/Overhead item saved successfully
```

This is **NOT** the same as adding an inventory purchase record!

---

## Key Differences

| Feature | Inventory Items | Overhead Items |
|---------|----------------|----------------|
| **Purpose** | Track raw material purchases | Track operating expenses |
| **Examples** | Chicken, flour, vegetables | Fuel, travel, repairs |
| **Button** | Add Inventory Item | Add Overhead Cost |
| **Log Prefix** | 📦 | 💰 or 🔧 |
| **Category Type** | Raw materials, packaging, etc. | Fuel, travel, marketing, etc. |

---

## Console Log Quick Reference

### On Page Load:
- `📦 Loaded Inventory Purchase Records` = Raw materials purchased
- `🔧 Loaded Overhead/Expense Items` = Business expenses
- `🔧 Loaded Fixed Cost Items` = Monthly fixed costs

### When Adding Expenses:
- `💰 Adding Expense/Overhead item` = Adding a new expense
- `✅ Expense/Overhead item saved successfully` = Expense saved

### When Adding Inventory:
- `📤 Sending inventory item to backend` = Adding new raw material purchase
- `✅ Received inventory item from backend` = Purchase record saved

---

## Need Help?

If you see confusing console logs:
1. Check the emoji prefix (📦 = inventory, 💰 = expense, 🔧 = fixed costs)
2. Look for the context (Page Load vs. User Action)
3. Refer to this guide for clarification

The system logs everything to help with debugging, but not all logs indicate a problem!

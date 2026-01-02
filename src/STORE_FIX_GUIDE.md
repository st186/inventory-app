# 🏪 Fix: Employees Showing in Wrong Store

## 🔴 Problem
**Issue:** Permanent employees from "Bunny Momos 2" are showing up in "Bunny Momos 1"

**Root Cause:** Employees have incorrect `storeId` values stored in their records, likely from:
- Manual data entry errors
- Migration issues
- Manager reassignments without store updates

---

## ✅ Solution Implemented

### **New Feature: "Change Store" Button**

I've added a complete store reassignment system:

#### **1. Visual Store Column** 
- Shows each employee's current store
- Only visible to cluster heads
- Shows "No Store" in red if unassigned

#### **2. Blue Store Icon Button** 🏪
- Appears in the Actions column
- Available for all employees and managers
- Only cluster heads can see/use it

#### **3. Store Reassignment Modal**
- Shows current store assignment
- Dropdown to select new store
- Warning if moving between stores
- Instant update with confirmation

---

## 🎯 How to Fix Your Current Issue

### **Step-by-Step: Move Employees to Correct Store**

#### **1. Open Employee Management**
- Make sure you're logged in as a **Cluster Head**
- You should see a new **"Store"** column in the employee table

#### **2. Identify Misplaced Employees**
- Look at the **Store** column
- Find employees showing "Bunny Momos 1" who should be in "Bunny Momos 2"

#### **3. Reassign to Correct Store**
For each misplaced employee:
1. Click the **blue Store icon** (🏪) in the Actions column
2. A modal opens showing current store
3. In the dropdown, select **"Bunny Momos 2"**
4. Click **"Update Store"**
5. Confirmation message appears!

#### **4. Verify the Fix**
- Go to **Store Management** (or your main dashboard)
- Select **"Bunny Momos 1"** from the store dropdown
- Verify only correct employees show
- Switch to **"Bunny Momos 2"**
- Verify the moved employees now appear here

---

## 🔧 Technical Details

### **Backend Endpoint**
```
PUT /employee/:employeeId/store
Body: { newStoreId: "store-id-here" }
```

**Features:**
- ✅ Validates store exists before assignment
- ✅ Only accessible to cluster heads
- ✅ Updates employee record immediately
- ✅ Returns old and new store IDs

### **Frontend Changes**

**File:** `/components/EmployeeManagement.tsx`

**New State:**
```typescript
showChangeStore: boolean
changingStoreFor: Employee | null
selectedNewStore: string
```

**New Functions:**
- `handleOpenChangeStore(emp)` - Opens the modal
- `handleChangeStore()` - Performs the update
- `updateEmployeeStore()` - API call

**UI Changes:**
- Added "Store" column (cluster heads only)
- Added blue Store icon button
- Added "Change Store" modal with dropdown

---

## 📊 What You'll See

### **Employee Table (Cluster Head View)**

| Employee ID | Name | Email | Role | **Store** | Type | Actions |
|------------|------|-------|------|-----------|------|---------|
| BM001 | John | ... | Employee | **Bunny Momos 1** | Full-Time | [View] [Delete] [Edit] [👤] [🏪] |
| BM002 | Jane | ... | Employee | **Bunny Momos 2** | Full-Time | [View] [Delete] [Edit] [👤] [🏪] |
| BM003 | Bob | ... | Employee | **No Store** | Contract | [View] [Delete] [Edit] [👤] [🏪] |

**Icons:**
- 👤 Purple = Assign Manager
- 🏪 Blue = Change Store
- ⚠️ Orange = Fix Invalid Role

---

## 🎨 Modal Preview

**Change Store Modal (Blue Theme):**
```
┌─────────────────────────────────────┐
│  Change Employee Store              │
│  John Doe (BM001)                   │
├─────────────────────────────────────┤
│                                     │
│  🏪 Current Store:                  │
│     Bunny Momos 1                   │
│                                     │
│  Select New Store *                 │
│  ┌───────────────────────────┐     │
│  │ Bunny Momos 2 - Delhi     │ ▼   │
│  └───────────────────────────┘     │
│                                     │
│  ⚠️ This will move the employee    │
│     to a different store            │
│                                     │
│  [Update Store]  [Cancel]           │
└─────────────────────────────────────┘
```

---

## 🚨 Important Notes

### **Manager Assignment**
- ✅ Changing store **does NOT** change the employee's manager
- ⚠️ If you want to change manager AND store, use both buttons:
  1. First: Click purple 👤 icon to change manager
  2. Then: Click blue 🏪 icon to change store (if needed)

### **Store Filtering**
- When a store is selected in your app, employees are filtered by `storeId`
- After reassignment, employees will instantly appear in the correct store view
- The migration script respects these manual assignments

### **Permissions**
- ✅ **Cluster Heads:** Can see Store column and change stores
- ❌ **Managers:** Cannot see Store column or change stores
- ❌ **Employees:** Cannot access this feature

---

## 💡 Prevention Tips

### **To Avoid This Issue in the Future:**

1. **Always assign managers to stores BEFORE assigning employees**
   - Go to Store Management
   - Assign each manager to their correct store
   - Then use "Assign Manager" for employees

2. **Run Store Migration after manager changes**
   - If you reassign a manager to a different store
   - Click "Migrate Stores" to update all their employees

3. **Use the Store column to audit**
   - Regularly check the Store column in Employee Management
   - Look for "No Store" entries (red text)
   - Use the blue 🏪 button to fix any misassignments

4. **Create employees through the correct store context**
   - When adding new employees, make sure you're viewing the correct store
   - Or immediately assign them to the correct manager/store

---

## 🔍 Debugging

### **Issue: Employee still in wrong store after update**
→ Refresh the page (the change is instant but UI might need refresh)

### **Issue: Can't see the Store column**
→ Make sure you're logged in as a Cluster Head (not Manager)

### **Issue: Store dropdown is empty**
→ Go to Store Management and create stores first

### **Issue: Change doesn't persist**
→ Check browser console for errors, there might be a backend issue

---

## 📝 Summary

**Problem:** Employees in wrong store  
**Cause:** Incorrect storeId in employee records  
**Solution:** New "Change Store" feature with blue 🏪 button  

**How to Fix:**
1. Find misplaced employees in Employee Management
2. Click blue 🏪 Store icon
3. Select correct store from dropdown
4. Click "Update Store"
5. Done! ✅

**Files Modified:**
- `/supabase/functions/server/index.tsx` - Added store update endpoint
- `/components/EmployeeManagement.tsx` - Added UI and Store column
- `/utils/api.ts` - Added `updateEmployeeStore()` function

---

## 🎉 Result

After fixing your misplaced employees:
- ✅ "Bunny Momos 1" shows only its employees
- ✅ "Bunny Momos 2" shows only its employees  
- ✅ Store filtering works correctly
- ✅ Reports and analytics are accurate
- ✅ Easy to audit and fix future issues

**You're all set!** 🚀

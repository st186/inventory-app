# 🛠️ Employee Role Fix Guide

## Problem Identified

Your system had **2 employees with custom/invalid roles**:
- **BM006 (Ajay)** - Role: "Momo Maker"
- **BM007 (Vikas Das)** - Role: "Kitchen Helper"

These custom roles caused:
- ❌ **Migration errors** ("Unexpected condition")
- ❌ **Store assignment failures**
- ❌ **System confusion** about permissions

---

## ✅ Solutions Implemented

### 1. **Migration Script Fixed**
**File:** `/supabase/functions/server/index.tsx`

**What Changed:**
- Now treats **ANY role that's not `manager` or `cluster_head`** as an employee
- Custom roles like "Momo Maker" will now be migrated correctly
- No more "Unexpected condition" errors

**Logic:**
```
If role is NOT 'manager' AND NOT 'cluster_head':
  → Treat as employee
  → Assign store from their manager
```

---

### 2. **Role Editor Added**
**File:** `/components/EmployeeManagement.tsx`

**New Features:**
✨ **Orange Alert Button** appears for employees with invalid roles
✨ **"Fix Role" Modal** with:
  - Warning message showing the invalid role
  - Dropdown to select correct role:
    - `employee` - Regular staff (can be fulltime OR contract workers)
    - `manager` - Manages employees and a store
    - `cluster_head` - Manages multiple stores
  - Updates both database AND auth metadata

**Backend Endpoint:**
- `PUT /employee/:employeeId/role`
- Only accessible to cluster heads
- Validates role is one of: `employee`, `manager`, `cluster_head`

---

## 🎯 How to Fix Your Current Issues

### **Step-by-Step Instructions:**

#### **STEP 1: Fix Invalid Roles**
1. Go to **Employee Management**
2. Look for employees with an **orange ⚠️ alert icon** (BM006, BM007)
3. Click the **orange alert button**
4. Modal opens showing the invalid role
5. Select **"Employee - Regular staff member"**
6. Click **"Update Role"**
7. Repeat for all employees with orange alert icons

#### **STEP 2: Assign Store to Manager (BM004)**
1. Click **"Stores"** in the navigation menu
2. Find a store (or create one if needed)
3. Click **"Assign Manager"** on the store card
4. Select **"Aniket Prasad (BM004)"** from dropdown
5. Click **"Assign"**

#### **STEP 3: Run Migration Again**
1. Go back to **Employee Management**
2. Click **"Migrate Stores"** button
3. Migration should now succeed! Expected results:
   - ✅ **0 errors** (no more "Unexpected condition")
   - ✅ **4 updated** (BM001, BM002, BM003, and any fixed roles)
   - ⚠️ **1 needs manual assignment** (BM004 if not assigned yet)

---

## 🔍 Before vs After

### **BEFORE:**
```
Migration Result:
- 2 Errors (BM006, BM007 - "Unexpected condition")
- 4 Need Manual Assignment
```

### **AFTER (Expected):**
```
Migration Result:
- 0 Errors! ✅
- 1 Need Manual Assignment (only BM004 until store assigned)
- 6 Updated successfully
```

---

## 💡 Key Improvements

### **1. Migration Script is Smarter**
- ✅ Handles custom roles automatically
- ✅ Treats all non-manager/non-cluster_head roles as employees
- ✅ No more unexpected errors for custom job titles

### **2. Role Management**
- ✅ Visual warning (orange alert) for invalid roles
- ✅ Easy fix with dropdown selection
- ✅ Updates both database and authentication
- ✅ Only cluster heads can edit roles (security)

### **3. Better Error Messages**
- ✅ Migration now shows role type in errors
- ✅ Clearer distinction between "needs manual assignment" vs "error"

---

## 🚨 Important Notes

### **Valid Roles Only:**
The system recognizes **ONLY these 3 roles**:
1. `employee` - Regular staff (kitchen staff, delivery, etc.) - can be fulltime OR contract
2. `manager` - Store managers who supervise employees
3. `cluster_head` - Top-level admins who manage multiple stores

### **Role vs Employment Type:**
- ✅ **Role** = Permission level (employee/manager/cluster_head)
- ✅ **Employment Type** = Contract status (fulltime/contract)
- 💡 **Example:** A "Kitchen Helper" can be:
  - **Role:** employee
  - **Type:** contract
  - This gives them regular staff permissions while being a contract worker

### **Job Titles vs Roles:**
- ❌ **Don't use** job titles as roles ("Momo Maker", "Chef", etc.)
- ✅ **Use** role for permissions, store job title separately if needed
- 💡 **Future Enhancement:** You could add a separate "jobTitle" field for display purposes

### **Migration is Idempotent:**
- ✅ Safe to run multiple times
- ✅ Won't duplicate or break existing data
- ✅ Only updates employees that need it

---

## 🎉 What's Next?

After completing the 3 steps above:

1. **All employees** should have valid roles
2. **All employees** should have stores assigned
3. **Migration** should show 0 errors
4. **System** will work correctly for:
   - Attendance tracking
   - Leave applications
   - Payroll management
   - Store-filtered views

---

## 🆘 Troubleshooting

### **Issue: Still seeing orange alert icon**
→ Click it and update the role to `employee`

### **Issue: Migration still shows errors**
→ Make sure ALL orange alert employees are fixed first

### **Issue: Employee still shows "No Store"**
→ Their manager needs a store assigned via Store Management

### **Issue: Can't see "Fix Role" button**
→ Only cluster heads can see this button

---

## 📝 Summary

**Files Modified:**
1. `/supabase/functions/server/index.tsx` - Smarter migration logic
2. `/components/EmployeeManagement.tsx` - Role editor UI
3. `/utils/api.ts` - New `updateEmployeeRole()` function

**New Features:**
- ✅ Orange alert button for invalid roles
- ✅ Role editor modal
- ✅ Backend validation
- ✅ Smart migration handling

**Result:**
Your system now **automatically handles custom roles** and provides an **easy way to fix them**! 🎊

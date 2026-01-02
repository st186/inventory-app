# 📋 How to Assign Stores to Managers and Managers to Employees

This guide explains the **two-step process** for resolving the manual assignment warnings from the Store Migration utility.

---

## 🎯 Overview

The system has a hierarchical structure:
```
Cluster Head
    ↓
Managers (assigned to stores)
    ↓
Employees (inherit manager's store)
```

For the migration to work automatically, you need to:
1. **Assign stores to managers** (if they don't have one)
2. **Assign managers to employees** (if they don't have one)

---

## 📍 Step 1: Assign Stores to Managers

**Who can do this:** Cluster Heads only

### Instructions:

1. **Go to Store Management**
   - Click the **"Stores"** button in the navigation menu (visible only to cluster heads)

2. **Find the manager who needs a store assignment**
   - Look at the store cards
   - Each card shows which manager is assigned (or says "No manager assigned")

3. **Assign a Manager to a Store**
   - Click the **"Assign Manager"** button on any store card
   - A dropdown will appear showing all available managers
   - Select the manager you want to assign
   - Click **"Assign"**
   - The manager will now have a `storeId` set to that store

4. **Verify the assignment**
   - The store card should now show the manager's name and ID
   - The manager can now only see data for that specific store

---

## 👥 Step 2: Assign Managers to Employees

**Who can do this:** Currently this can only be done **during employee creation**

### Current Limitation:
- When creating a new employee, they are **automatically assigned** to the manager who creates them
- There is currently **no UI to change an employee's manager** after creation

### Workaround for Existing Employees:

#### Option A: Re-create the Employee (Recommended for few employees)
1. Note down all the employee's information
2. Delete the old employee record
3. Have the correct manager create a new employee with the same information
4. The employee will automatically be assigned to that manager

#### Option B: Request a Feature Enhancement
- We can add a "Change Manager" button in the Employee Management screen
- This would allow cluster heads to reassign employees to different managers

---

## 🔄 After Making Assignments

Once you've:
1. ✅ Assigned stores to all managers
2. ✅ Assigned managers to all employees

Run the **"Migrate Stores"** button again in Employee Management, and you should see:
- Fewer items in "Needs Manual Assignment"
- More items in "Successfully Updated"

---

## 📊 Understanding Migration Results

### ✓ Successfully Updated
Employees whose stores were automatically assigned based on their manager's store.

### — Skipped
Employees who already have a `storeId` or cluster heads (who don't need stores).

### ⚠ Needs Manual Assignment
- **Managers without stores**: Go to Store Management → Assign them to a store
- **Employees without managers**: Need to be assigned a manager
- **Employees whose managers have no store**: First assign a store to their manager

### ✗ Errors
True errors like missing manager IDs that don't exist in the system - these need investigation.

---

## 🎯 Quick Reference

| Problem | Solution | Where to Go |
|---------|----------|-------------|
| Manager has no store | Assign store to manager | **Store Management** → Click "Assign Manager" on store card |
| Employee has no manager | Re-create employee under correct manager | **Employee Management** → Have manager create employee |
| Employee's manager has no store | First assign store to manager, then run migration again | **Store Management** first, then **Migrate Stores** |

---

## 💡 Best Practices

1. **Always assign stores to managers first** before creating employees under them
2. **Create employees from the correct manager's account** so they inherit the right manager relationship
3. **Run the migration tool** after making changes to verify everything is connected
4. **Use the Store Selector** (as cluster head) to verify each store has the correct employees

---

## ❓ Common Questions

### Q: Why can't I see the "Assign Manager" button in Store Management?
**A:** Only cluster heads can assign managers to stores. Make sure you're logged in as a cluster head.

### Q: I assigned a store to a manager, but employees still show "needs manual assignment"
**A:** If the employees were created before you assigned the store, you need to run the "Migrate Stores" tool again to update them.

### Q: Can I reassign an employee to a different manager?
**A:** Currently, there's no UI for this. You would need to delete and recreate the employee under the new manager. (Or we can add this feature!)

### Q: What happens if I change a manager's store assignment?
**A:** The manager's `storeId` changes, but existing employees won't automatically update. You'll need to run the migration tool again.

---

## 🚀 Next Steps

1. Go to **Store Management** and assign stores to all managers
2. Check **Employee Management** to see which employees lack managers
3. Re-create those employees under the correct manager (or have the manager create them)
4. Run **"Migrate Stores"** again to verify all assignments are complete
5. Check each store's data using the **Store Selector** dropdown

---

Need help? The migration results will tell you exactly which employees or managers need attention!

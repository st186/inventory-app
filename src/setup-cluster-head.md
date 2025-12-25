# Setup Cluster Head Account

## Steps to Create Cluster Head Account

Since we need to create a cluster head account with proper employeeId, follow these steps:

### Option 1: Manual Setup (Recommended)

1. **First, log in with a temporary admin account** or create one if needed

2. **Go to Employee Management** tab

3. **Click "Add Employee/Manager"**

4. **Fill in the following details:**
   - Role: **Manager** (we'll change this to cluster_head later)
   - Employment Type: **Full-Time**
   - Full Name: **Subham Tewari**
   - Email: **subham.tewari@bunnymomos.com**
   - Password: **Subham@186**
   - Date of Birth: (Your DOB)
   - Phone Number: (Your phone)
   - Joining Date: (Today's date or actual joining date)

5. **Note the Employee ID** that gets generated (e.g., BM001)

6. **Update the role to cluster_head:**
   - You'll need to manually update the role in the database
   - Or use the script below

### Option 2: Using Backend Script

I'll create a backend endpoint to set up the cluster head account properly.

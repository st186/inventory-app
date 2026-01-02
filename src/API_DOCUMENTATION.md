# Bhandar-IMS API Documentation

Complete API reference for all backend endpoints.

## Base URL
```
https://{projectId}.supabase.co/functions/v1/make-server-c2dd9b9d
```

## Authentication

All requests (except auth endpoints) require an Authorization header:
```
Authorization: Bearer {access_token}
```

### Getting an Access Token
After login via Supabase Auth, the access token is available in the session:
```typescript
const { data: { session } } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

const accessToken = session.access_token;
```

---

## Authentication Endpoints

### Setup Test Cluster Head
Creates a test cluster head account for development.

**Endpoint:** `POST /auth/setup-test-cluster-head`

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Test cluster head created successfully!",
  "credentials": {
    "email": "admin@bhandar.com",
    "password": "Admin@123",
    "name": "Test Cluster Head",
    "role": "cluster_head",
    "employeeId": "BM001"
  }
}
```

---

## Store Management

### Get All Stores
Retrieves all stores in the system.

**Endpoint:** `GET /stores`

**Authentication:** Required

**Response:**
```json
{
  "stores": [
    {
      "id": "store_123",
      "name": "Store Alpha",
      "location": "Location A",
      "managerId": "BM002",
      "productionHouseId": "ph_456",
      "createdBy": "BM001",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Store
Creates a new store.

**Endpoint:** `POST /stores`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "name": "Store Beta",
  "location": "Location B"
}
```

**Response:**
```json
{
  "store": {
    "id": "store_789",
    "name": "Store Beta",
    "location": "Location B",
    "managerId": null,
    "productionHouseId": null,
    "createdBy": "BM001",
    "createdAt": "2026-01-02T00:00:00.000Z"
  }
}
```

### Update Store
Updates store details.

**Endpoint:** `PUT /stores/:storeId`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "name": "Updated Store Name",
  "location": "Updated Location"
}
```

### Assign Manager to Store
Assigns an Operations Manager to a store.

**Endpoint:** `PUT /stores/:storeId/assign-manager`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "managerId": "BM002"
}
```

### Assign Production House to Store
Maps a store to a production house.

**Endpoint:** `PUT /stores/:storeId/assign-production-house`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "productionHouseId": "ph_456"
}
```

---

## Production House Management

### Get All Production Houses
Retrieves all production houses.

**Endpoint:** `GET /production-houses`

**Authentication:** Required

**Response:**
```json
{
  "productionHouses": [
    {
      "id": "ph_123",
      "name": "Central Kitchen",
      "location": "Main Location",
      "productionHeadId": "BM003",
      "inventory": {
        "chicken": 1000,
        "chickenCheese": 500,
        "veg": 800,
        "cheeseCorn": 300,
        "paneer": 400,
        "vegKurkure": 200,
        "chickenKurkure": 250
      },
      "createdBy": "BM001",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Production House
Creates a new production house.

**Endpoint:** `POST /production-houses`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "name": "Kitchen North",
  "location": "North District",
  "createdBy": "BM001",
  "inventory": {
    "chicken": 0,
    "chickenCheese": 0,
    "veg": 0,
    "cheeseCorn": 0,
    "paneer": 0,
    "vegKurkure": 0,
    "chickenKurkure": 0
  }
}
```

### Update Production House Inventory
Updates the inventory levels at a production house.

**Endpoint:** `PUT /production-houses/:id/inventory`

**Authentication:** Required (Production Head or Cluster Head)

**Request Body:**
```json
{
  "inventory": {
    "chicken": 1500,
    "chickenCheese": 600,
    "veg": 900,
    "cheeseCorn": 350,
    "paneer": 450,
    "vegKurkure": 250,
    "chickenKurkure": 300
  }
}
```

### Assign Production Head
Assigns a production head to a production house.

**Endpoint:** `PUT /production-houses/:id/assign-head`

**Authentication:** Required (Cluster Head only)

**Request Body:**
```json
{
  "productionHeadId": "BM003"
}
```

### Delete Production House
Deletes a production house.

**Endpoint:** `DELETE /production-houses/:id`

**Authentication:** Required (Cluster Head only)

---

## Inventory Management

### Get Inventory
Retrieves all inventory items.

**Endpoint:** `GET /inventory`

**Authentication:** Required

**Response:**
```json
{
  "inventory": [
    {
      "id": "inv_123",
      "category": "Raw Materials",
      "item": "Chicken Mince",
      "quantity": 50,
      "unit": "kg",
      "date": "2026-01-02",
      "storeId": "store_123",
      "createdBy": "BM002"
    }
  ]
}
```

### Add Inventory Item
Adds a new inventory item.

**Endpoint:** `POST /inventory`

**Authentication:** Required

**Request Body:**
```json
{
  "category": "Raw Materials",
  "item": "Flour",
  "quantity": 100,
  "unit": "kg",
  "date": "2026-01-02",
  "storeId": "store_123"
}
```

### Update Inventory Item
Updates an existing inventory item.

**Endpoint:** `PUT /inventory/:id`

**Authentication:** Required

**Request Body:**
```json
{
  "quantity": 75,
  "unit": "kg"
}
```

### Delete Inventory Item
Deletes an inventory item.

**Endpoint:** `DELETE /inventory/:id`

**Authentication:** Required

---

## Employee Management

### Get All Employees
Retrieves all active employees.

**Endpoint:** `GET /employees`

**Authentication:** Required

**Response:**
```json
{
  "employees": [
    {
      "id": "emp_123",
      "employeeId": "BM002",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "manager",
      "designation": "store_incharge",
      "department": "store_operations",
      "storeId": "store_123",
      "managerId": null,
      "clusterHeadId": "BM001",
      "employmentType": "fulltime",
      "joiningDate": "2025-12-01",
      "status": "active",
      "createdAt": "2025-12-01T00:00:00.000Z"
    }
  ]
}
```

### Create Employee
Creates a new employee with auth account.

**Endpoint:** `POST /unified-employees`

**Authentication:** Required (Cluster Head or Manager)

**Request Body:**
```json
{
  "employeeId": "BM004",
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "SecurePass123!",
  "role": "employee",
  "employmentType": "fulltime",
  "joiningDate": "2026-01-05",
  "storeId": "store_123",
  "managerId": "BM002",
  "clusterHeadId": "BM001"
}
```

**Response:**
```json
{
  "success": true,
  "employee": { /* employee object */ },
  "authUser": { /* auth user object */ }
}
```

### Update Employee
Updates employee details.

**Endpoint:** `PUT /unified-employees/:employeeId`

**Authentication:** Required (Cluster Head or Manager)

**Request Body:**
```json
{
  "name": "Jane Smith Updated",
  "storeId": "store_456",
  "designation": "production_incharge"
}
```

### Delete Employee
Deletes an employee and their auth account.

**Endpoint:** `DELETE /unified-employees/:employeeId`

**Authentication:** Required (Cluster Head only)

### Reset Employee Password
Resets an employee's password.

**Endpoint:** `POST /unified-employees/:employeeId/reset-password`

**Authentication:** Required (Cluster Head or Manager)

**Request Body:**
```json
{
  "newPassword": "NewSecurePass123!"
}
```

### Get Employees by Manager
Retrieves all employees under a specific manager.

**Endpoint:** `GET /unified-employees/manager/:managerId`

**Authentication:** Required

### Get Managers by Cluster Head
Retrieves all managers under a cluster head.

**Endpoint:** `GET /unified-employees/cluster-head/:clusterHeadId`

**Authentication:** Required

---

## Production Requests

### Get Production Requests
Retrieves all production requests.

**Endpoint:** `GET /production-requests`

**Authentication:** Required

**Query Parameters:**
- `storeId` (optional): Filter by store
- `status` (optional): Filter by status

**Response:**
```json
{
  "requests": [
    {
      "id": "pr_123",
      "requestDate": "2026-01-02",
      "storeId": "store_123",
      "storeName": "Store Alpha",
      "requestedBy": "BM002",
      "requestedByName": "John Doe",
      "status": "pending",
      "chickenMomos": 500,
      "chickenCheeseMomos": 300,
      "vegMomos": 400,
      "cheeseCornMomos": 200,
      "paneerMomos": 250,
      "vegKurkureMomos": 150,
      "chickenKurkureMomos": 200,
      "kitchenUtilities": {
        "Oil": { "quantity": 5, "unit": "liters" }
      },
      "sauces": {
        "Red Chili": true,
        "Schezwan": true
      },
      "createdAt": "2026-01-02T08:00:00.000Z",
      "updatedAt": "2026-01-02T08:00:00.000Z"
    }
  ]
}
```

### Create Production Request
Creates a new production request.

**Endpoint:** `POST /production-requests`

**Authentication:** Required (Store In-Charge)

**Request Body:**
```json
{
  "requestDate": "2026-01-03",
  "storeId": "store_123",
  "requestedBy": "BM002",
  "requestedByName": "John Doe",
  "chickenMomos": 600,
  "chickenCheeseMomos": 350,
  "vegMomos": 450,
  "cheeseCornMomos": 250,
  "paneerMomos": 300,
  "vegKurkureMomos": 180,
  "chickenKurkureMomos": 220,
  "notes": "Urgent: Party order"
}
```

### Update Production Request Status
Updates the status of a production request.

**Endpoint:** `PUT /production-requests/:id/status`

**Authentication:** Required (Production Head or Store In-Charge)

**Request Body:**
```json
{
  "status": "in-preparation",
  "updatedBy": "BM003"
}
```

**Valid Status Transitions:**
- `pending` → `accepted` (Production Head)
- `accepted` → `in-preparation` (Production Head)
- `in-preparation` → `prepared` (Production Head)
- `prepared` → `shipped` (Production Head)
- `shipped` → `delivered` (Store In-Charge)

---

## Stock Requests

### Get Stock Requests
Retrieves all stock requests.

**Endpoint:** `GET /stock-requests`

**Authentication:** Required

**Response:**
```json
{
  "stockRequests": [
    {
      "id": "sr_123",
      "storeId": "store_123",
      "storeName": "Store Alpha",
      "productionHouseId": "ph_456",
      "productionHouseName": "Central Kitchen",
      "requestedBy": "BM002",
      "requestedByName": "John Doe",
      "requestDate": "2026-01-02",
      "requestedQuantities": {
        "chicken": 200,
        "chickenCheese": 100,
        "veg": 150,
        "cheeseCorn": 80,
        "paneer": 120,
        "vegKurkure": 60,
        "chickenKurkure": 70
      },
      "fulfilledQuantities": null,
      "status": "pending",
      "fulfilledBy": null,
      "fulfilledByName": null,
      "fulfillmentDate": null,
      "notes": null
    }
  ]
}
```

### Create Stock Request
Creates a new stock request from store to production house.

**Endpoint:** `POST /stock-requests`

**Authentication:** Required (Store In-Charge)

**Request Body:**
```json
{
  "storeId": "store_123",
  "productionHouseId": "ph_456",
  "requestedBy": "BM002",
  "requestedByName": "John Doe",
  "requestDate": "2026-01-03",
  "requestedQuantities": {
    "chicken": 250,
    "chickenCheese": 120,
    "veg": 180,
    "cheeseCorn": 90,
    "paneer": 140,
    "vegKurkure": 70,
    "chickenKurkure": 80
  }
}
```

### Fulfill Stock Request
Fulfills a stock request (Production Head).

**Endpoint:** `PUT /stock-requests/:id/fulfill`

**Authentication:** Required (Production Head)

**Request Body:**
```json
{
  "fulfilledQuantities": {
    "chicken": 250,
    "chickenCheese": 100,
    "veg": 180,
    "cheeseCorn": 90,
    "paneer": 140,
    "vegKurkure": 70,
    "chickenKurkure": 80
  },
  "fulfilledBy": "BM003",
  "fulfilledByName": "Production Head",
  "notes": "Partial fulfillment: Chicken Cheese limited stock"
}
```

**Status Determination:**
- All quantities fulfilled → `fulfilled`
- Some quantities less than requested → `partially_fulfilled`

### Cancel Stock Request
Cancels a pending stock request.

**Endpoint:** `PUT /stock-requests/:id/cancel`

**Authentication:** Required (Store In-Charge or Production Head)

---

## Stock Recalibration

### Submit Stock Recalibration
Submits monthly physical stock count for approval.

**Endpoint:** `POST /stock-recalibration`

**Authentication:** Required (Manager)

**Request Body:**
```json
{
  "locationId": "store_123",
  "locationType": "store",
  "locationName": "Store Alpha",
  "items": [
    {
      "itemId": "inv_123",
      "itemName": "Chicken Mince",
      "category": "Raw Materials",
      "unit": "kg",
      "systemQuantity": 50,
      "actualQuantity": 48,
      "difference": -2,
      "adjustmentType": "wastage",
      "notes": "Spoilage detected"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "recalibration": {
    "id": "recal_123",
    "locationId": "store_123",
    "month": "2026-01",
    "status": "pending",
    "submittedBy": "BM002",
    "submittedAt": "2026-01-02T10:00:00.000Z"
  }
}
```

### Get Latest Recalibration
Gets the most recent recalibration for a location.

**Endpoint:** `GET /stock-recalibration/latest/:locationId`

**Authentication:** Required

**Query Parameters:**
- `locationType` (optional): `store` or `production_house`

### Get Recalibration History
Gets historical recalibrations for a location.

**Endpoint:** `GET /stock-recalibration/history/:locationId`

**Authentication:** Required

**Query Parameters:**
- `locationType` (optional): `store` or `production_house`

### Get Pending Recalibrations (Cluster Head)
Gets all recalibrations pending approval.

**Endpoint:** `GET /stock-recalibration/pending-approval`

**Authentication:** Required (Cluster Head)

### Approve Recalibration
Approves a recalibration (Cluster Head only).

**Endpoint:** `POST /stock-recalibration/:id/approve`

**Authentication:** Required (Cluster Head)

**Response:**
```json
{
  "success": true,
  "message": "Recalibration approved and inventory updated",
  "recalibration": { /* updated recalibration */ }
}
```

### Reject Recalibration
Rejects a recalibration (Cluster Head only).

**Endpoint:** `POST /stock-recalibration/:id/reject`

**Authentication:** Required (Cluster Head)

**Request Body:**
```json
{
  "reason": "Discrepancies too large, please recount"
}
```

### Get Wastage Report
Generates a monthly wastage report.

**Endpoint:** `GET /stock-recalibration/wastage-report`

**Authentication:** Required

**Query Parameters:**
- `month` (required): Format `YYYY-MM`
- `locationId` (optional): Filter by location
- `locationType` (optional): `store` or `production_house`

**Response:**
```json
{
  "month": "2026-01",
  "totalWastage": 150,
  "wastageByCategory": {
    "Raw Materials": 80,
    "Finished Goods": 70
  },
  "wastageByLocation": {
    "Store Alpha": 90,
    "Store Beta": 60
  }
}
```

---

## Sales Management

### Get Sales Data
Retrieves sales records.

**Endpoint:** `GET /sales-data`

**Authentication:** Required

**Response:**
```json
{
  "data": [
    {
      "id": "sales_123",
      "date": "2026-01-02",
      "storeId": "store_123",
      "storeName": "Store Alpha",
      "data": {
        "Chicken Momos": 450,
        "Chicken Cheese Momos": 280,
        "Veg Momos": 320,
        "Paneer Momos": 200,
        "Corn Cheese Momos": 150,
        "Chicken Kurkure Momos": 180,
        "Veg Kurkure Momos": 120
      },
      "uploadedBy": "BM002",
      "uploadedAt": "2026-01-02T18:00:00.000Z"
    }
  ]
}
```

### Save Sales Data
Records daily sales data.

**Endpoint:** `POST /sales-data`

**Authentication:** Required (Store In-Charge)

**Request Body:**
```json
{
  "date": "2026-01-03",
  "storeId": "store_123",
  "storeName": "Store Alpha",
  "data": {
    "Chicken Momos": 500,
    "Chicken Cheese Momos": 300,
    "Veg Momos": 350,
    "Paneer Momos": 220,
    "Corn Cheese Momos": 170,
    "Chicken Kurkure Momos": 200,
    "Veg Kurkure Momos": 140
  },
  "uploadedBy": "BM002"
}
```

### Delete Sales Data
Deletes a sales record.

**Endpoint:** `DELETE /sales-data/:id`

**Authentication:** Required (Cluster Head or Manager)

---

## Leave Management

### Get Employee Leaves
Retrieves leave applications for an employee.

**Endpoint:** `GET /leaves/:employeeId`

**Authentication:** Required

### Get All Leaves
Retrieves all leave applications (Manager/Cluster Head).

**Endpoint:** `GET /leaves/all`

**Authentication:** Required (Manager or Cluster Head)

### Apply for Leave
Submits a leave application.

**Endpoint:** `POST /leaves`

**Authentication:** Required

**Request Body:**
```json
{
  "employeeId": "BM004",
  "leaveDate": "2026-01-10",
  "reason": "Personal work"
}
```

### Approve Leave
Approves a leave application.

**Endpoint:** `POST /leaves/:id/approve`

**Authentication:** Required (Manager or Cluster Head)

**Request Body:**
```json
{
  "managerId": "BM002",
  "managerName": "John Doe"
}
```

### Reject Leave
Rejects a leave application.

**Endpoint:** `POST /leaves/:id/reject`

**Authentication:** Required (Manager or Cluster Head)

**Request Body:**
```json
{
  "managerId": "BM002",
  "managerName": "John Doe",
  "reason": "Insufficient staff on that day"
}
```

### Get Leave Balance
Calculates remaining leave balance for an employee.

**Endpoint:** `GET /leaves/:employeeId/balance`

**Authentication:** Required

**Query Parameters:**
- `joiningDate` (required): Employee's joining date

**Response:**
```json
{
  "balance": 8
}
```

---

## Notifications

### Get Notifications
Retrieves notifications for the logged-in user.

**Endpoint:** `GET /notifications`

**Authentication:** Required

**Response:**
```json
{
  "notifications": [
    {
      "id": "notif_123",
      "userId": "auth_user_id",
      "type": "production_request",
      "title": "New Production Request",
      "message": "Store Alpha has requested 500 Chicken Momos",
      "relatedId": "pr_123",
      "relatedDate": "2026-01-03",
      "read": false,
      "createdAt": "2026-01-03T08:30:00.000Z"
    }
  ]
}
```

### Mark Notification as Read
Marks a single notification as read.

**Endpoint:** `PUT /notifications/:id/read`

**Authentication:** Required

### Mark All Notifications as Read
Marks all notifications as read.

**Endpoint:** `PUT /notifications/read-all`

**Authentication:** Required

---

## Cluster Management

### Get Cluster Info
Retrieves cluster assignments for the logged-in cluster head.

**Endpoint:** `GET /cluster/info`

**Authentication:** Required (Cluster Head)

**Response:**
```json
{
  "employeeId": "BM001",
  "managedStoreIds": ["store_123", "store_456"],
  "managedProductionHouseIds": ["ph_789"]
}
```

### Update Cluster Assignments
Updates which stores/production houses a cluster head manages.

**Endpoint:** `POST /cluster/update-assignments`

**Authentication:** Required (Cluster Head)

**Request Body:**
```json
{
  "employeeId": "BM001",
  "managedStoreIds": ["store_123", "store_456", "store_789"],
  "managedProductionHouseIds": ["ph_789", "ph_012"]
}
```

### Get All Cluster Heads
Retrieves all cluster heads in the system.

**Endpoint:** `GET /cluster/all-cluster-heads`

**Authentication:** Required (Cluster Head)

---

## Push Notifications

### Get VAPID Public Key
Retrieves the VAPID public key for push notification subscription.

**Endpoint:** `GET /push/vapid-public-key`

**Authentication:** Not required

**Response:**
```json
{
  "publicKey": "BF7x..."
}
```

### Subscribe to Push Notifications
Subscribes a user to push notifications.

**Endpoint:** `POST /push/subscribe`

**Authentication:** Required

**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  },
  "userId": "auth_user_id"
}
```

---

## Error Responses

All endpoints may return the following error formats:

### 400 Bad Request
```json
{
  "error": "Missing required field: name"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized"
}
```

### 403 Forbidden
```json
{
  "error": "You don't have permission to perform this action"
}
```

### 404 Not Found
```json
{
  "error": "Store not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to process request"
}
```

---

## Rate Limiting

Currently, there are no explicit rate limits. However, Supabase Edge Functions have default limits:
- Max execution time: 60 seconds
- Max memory: 512 MB

---

## Changelog

### Version 2.0.0 (January 2, 2026)
- Complete API restructure with proper documentation
- Added stock recalibration endpoints
- Added cluster management endpoints
- Improved error handling with auto-logout on 401

### Version 1.0.0 (December 2025)
- Initial release
- Basic CRUD operations for all entities
- Authentication and authorization

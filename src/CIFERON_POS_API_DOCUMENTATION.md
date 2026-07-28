# Ciferon POS Integration — External API Reference

This documents the **third-party Ciferon/ADSR POS APIs** used to auto-fetch daily sales
data for the store-incharge validation flow (see `SalesManagement.tsx`'s `posOnlineSales`/
`posOfflineSales` placeholder fields). These are external vendor endpoints, not part of
Bhandar-IMS's own backend — see `API_DOCUMENTATION.md` for that.

Two APIs are relevant:

1. **`SaleDetails`** — the official, ADSR-issued integration API (documented, stable, uses
   a long-lived API key). Gives order-level totals only — no item names, no payment-mode
   summary.
2. **`OrderReport/Sale`** — an *internal/undocumented* endpoint the Ciferon admin panel
   itself calls to render the "Sales Summary" report. Gives the payment-mode breakdown
   (Cash/Paytm/Zomato/Swiggy totals) that `SaleDetails` doesn't expose. Found by inspecting
   the admin panel's network requests — **not an officially issued integration endpoint**,
   so it can change or break without notice. Use for now, but keep pushing ADSR to expose
   an equivalent on the official API key (see "Open ask to ADSR" below).

---

## 1. SaleDetails (official integration API)

**Endpoint:** `POST https://api.ciferon.com/api/LoginApi/SaleDetails`

**Headers:**
```
Authorization: Bearer {integration_api_key}
Content-Type: application/json
```
Integration key is issued per-account by ADSR/Ciferon — long-lived, not a session token.

**Request body:**
```json
{
  "StartDate": "2026-07-28",
  "EndDate": "2026-07-28"
}
```

**Response:**
```json
{
  "IsSuccess": true,
  "Result": {
    "orderList": [
      {
        "OrderID": 55492025,
        "TransactionNumber": "ZT-1670",
        "TransactionTime": "2026-07-21T15:14:20",
        "DiscountAmount": 120.0,
        "TaxAmount": 0.0,
        "BillAmount": 140.0,
        "Subtotal": 260.0,
        "PaymentMode": ["Zomato"],
        "TransactionStatus": "Complete",
        "IsComplimentary": false,
        "TransactionType": "SaleInvoice",
        "OrderItemList": [
          { "Quantity": 1.0, "Rate": 130.0, "TotalTax": 0.0, "Total": 130.0 }
        ]
      }
    ]
  }
}
```

**Known limitations:**
- `OrderItemList` line items have no item name/SKU — quantity/rate/total only. Can't be used
  for item-wise sales reporting.
- No aggregate summary — you must sum `orderList` yourself (per order, `BillAmount`; per
  payment mode, group by `PaymentMode[0]`).
- `PaymentMode` is a single-element array in every sample seen — one payment mode per order,
  not split-payment aware.

---

## 2. OrderReport/Sale (internal admin-panel endpoint — undocumented)

**Endpoint:** `GET https://api.ciferon.com/api/OrderReport/Sale`

**Headers:**
```
Authorization: Bearer {session_authkey}
StoreId: {storeId}
BrandId: 0
Accept: application/json
```
`{session_authkey}` is the admin-panel login session token (stored in the browser's
`localStorage.authkey` after logging in) — **different from the integration API key above**,
and not something ADSR issues for programmatic use. Treat this endpoint as fragile.

**Query params:**
```
StartDate=Tue, 28 Jul 2026 00:00:00 GMT   # RFC-1123 date format, note the literal comma
EndDate=Tue, 28 Jul 2026 00:00:00 GMT
ReportType=SaleReport
IsSplitPaymentMode=true                   # required to get the PaymentList breakdown
IsAllVisible=false
SaleOrderType=undefined                   # or 'DineIn' / 'TakeAway' / 'HomeDelivery' to filter
IsCancel=false
IsComplementary=false
IsPending=false
IsSettle=false
IsInit=false
PaymentModeIds=undefined
StoreIds=undefined
PaymentFilter=undefined
IsEdit=false
IsReprint=false
IsCustomerGst=false
IsDiscount=false
CompanyBrandId=0
IsDeliveryApp=false
TerminalId=0
```

**Response (`Result` object, relevant fields only):**
```json
{
  "IsSuccess": true,
  "Result": {
    "GrandTotal": 61652.94,
    "totalOrder": 343,
    "Discount": 794.48,
    "Subtotal": 2961,
    "FoodTotal": 2961,
    "BarTotal": 0,
    "Charges": 0,
    "TotalTax": 0,
    "PaymentList": [
      { "PaymentNoteType": "Cash", "Amount": 4055 },
      { "PaymentNoteType": "Paytm", "Amount": 24540 },
      { "PaymentNoteType": "PhonePe", "Amount": 0 },
      { "PaymentNoteType": "Card", "Amount": 0 },
      { "PaymentNoteType": "Google Pay", "Amount": 0 },
      { "PaymentNoteType": "Razorpay", "Amount": 0 },
      { "PaymentNoteType": "Zomato", "Amount": 25082.32 },
      { "PaymentNoteType": "Swiggy", "Amount": 8194.62 }
    ],
    "OrderList": [
      {
        "OrderId": 55835485,
        "SerialNo": "ZT-1802",
        "EntryDate": "2026-07-28T16:40:15",
        "SaleOrderType": "HomeDelivery",
        "PaymentMode": "Zomato",
        "GrandTotal": 344.32,
        "Subtotal": 384.0,
        "Discount": 39.68,
        "OrderStatus": "Confirmed",
        "PaymentNotes": [
          { "PaymentMode": "Zomato", "NewAmount": 344.32, "PaymentNoteId": 162476734 }
        ]
      }
    ]
  }
}
```

**How to derive what we need:**

| Value | Source |
|---|---|
| Total Sales | `Result.GrandTotal` |
| Total Cash | `Result.PaymentList[type=Cash].Amount` |
| Total Paytm | `Result.PaymentList[type=Paytm].Amount` |
| Zomato total | `Result.PaymentList[type=Zomato].Amount` |
| Swiggy total | `Result.PaymentList[type=Swiggy].Amount` |
| Dine-in / Takeaway / Home Delivery split | group `Result.OrderList` by `SaleOrderType`, sum `GrandTotal` per group (not in `PaymentList` — different dimension than payment mode) |

Verified live against the store's last-7-days data:
`Cash ₹4,055 · Paytm ₹24,540 · Zomato ₹25,082.32 · Swiggy ₹8,194.62`
`DineIn ₹19,390 · TakeAway ₹9,200 · HomeDelivery ₹33,772.94`

---

## Open ask to ADSR / Ciferon

Send them the shapes above and ask for:
1. Item name/SKU on `SaleDetails`'s `OrderItemList` (or a separate item-master lookup).
2. A `PaymentList`-equivalent (cash/paytm/aggregator totals) exposed on the official
   integration API key, not just the internal admin-panel session endpoint.

---

## Security note (unrelated to the API itself)

The Ciferon admin panel stores the logged-in user's **plaintext password** in
`localStorage` under the `LogintUser` key. Worth reporting to Ciferon separately — this is
readable by any XSS or malicious browser extension on `admin.ciferon.com`.

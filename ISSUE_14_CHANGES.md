# Issue #14: Real-Time Hospital Administrative Analytics Suite & Metrics Charts

## 1. Summary

**Issue #14 Objective:** Create MongoDB aggregation pipelines and visual dashboard charts for hospital utilization, peak booking hours, and revenue trends.

**Delivered:**
- Backend controller (`adminAnalyticsController.js`) providing `GET /api/admin/analytics` with three aggregation pipelines:
  1. **Department Utilization:** Aggregates appointment volume, completed appointments, cancellations, and utilization rate per department.
  2. **Peak Booking Hours:** Extracts booking slot start hours from `"HH:mm"` strings and computes distribution of active appointments across the day.
  3. **Revenue Trends:** Aggregates monthly completed consultation fee revenues over the trailing 6 months, dynamically zero-filling missing months.
- Route and middleware wiring (`adminRoutes.js` mounted at `/api/admin` in `server.js`) secured with JWT authentication (`protect`) and role-based access control (`authorize('admin')`).
- Frontend administrative dashboard (`AnalyticsDashboard.jsx`) built with Recharts (`BarChart`, `AreaChart`, and `LineChart`), `ResponsiveContainer`, 60-second near-real-time polling with lifecycle interval cleanup, and loading/error/empty state handling.
- Frontend navigation and routing integration in `App.jsx` and `Layout.jsx`, along with API client method in `adminApi.js`.

---

## 2. Files Changed

| File | New / Modified | Purpose |
| :--- | :--- | :--- |
| `backend/controllers/adminAnalyticsController.js` | New | Controller implementing the three MongoDB aggregation pipelines for utilization, peak booking hours, and monthly revenue trends. |
| `backend/routes/adminRoutes.js` | New | Route definition for `GET /api/admin/analytics` protected by `protect` and `authorize('admin')`. |
| `backend/server.js` | Modified | Mounts `/api/admin` router. |
| `frontend/src/api/adminApi.js` | Modified | Adds `getAnalytics()` client function calling `/admin/analytics`. |
| `frontend/src/pages/admin/AnalyticsDashboard.jsx` | New | Admin UI page rendering Recharts visualizations with 60s auto-refresh, loading spinners, empty states, and error alerts. |
| `frontend/src/App.jsx` | Modified | Registers protected `/admin/analytics` route under admin layout. |
| `frontend/src/components/common/Layout.jsx` | Modified | Adds "Analytics" link to the admin navigation bar. |
| `frontend/package.json` | Modified | Adds `recharts` dependency. |
| `frontend/package-lock.json` | Modified | Locks `recharts` and related dependency graph. |
| `ISSUE_14_CHANGES.md` | New | Dedicated documentation of issue #14 implementation and verification. |

---

## 3. Code Walkthrough

### 3.1 Backend Controller (`backend/controllers/adminAnalyticsController.js`)

The `getAnalytics` handler is wrapped in `asyncHandler` and executes three aggregation pipelines in parallel via `Promise.all`:

1. **Utilization Pipeline (feeds Bar Chart):**
   - Stage 1 (`$group`): Groups by `$department`, computing `total` count of appointments, `completed` count (`$cond: [{ $eq: ['$status', 'completed'] }, 1, 0]`), and `cancelled` count (`$cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]`).
   - Stage 2 (`$lookup`): Joins with `departments` collection matching `_id` to resolve department name.
   - Stage 3 (`$project`): Projects department `name` (falling back to `'Unassigned'` if missing), counts, and computes `rate` (`(completed / total) * 100` rounded to 1 decimal place).
   - Stage 4 (`$sort`): Sorts descending by `total` appointment count.

2. **Peak Booking Hours Pipeline (feeds Area Chart):**
   - Stage 1 (`$match`): Filters out cancelled appointments (`status: { $ne: 'cancelled' }`) so the chart reflects actual demand.
   - Stage 2 (`$project`): Extracts the 2-digit hour substring from `"HH:mm"` (`startTime`) using `$substrCP: ['$startTime', 0, 2]` and converts to integer with `$toInt`.
   - Stage 3 (`$group`): Groups by hour and accumulates `count: { $sum: 1 }`.
   - Stage 4 (`$project`): Formats output as `{ hour: '$_id', count: 1 }`.
   - Stage 5 (`$sort`): Sorts chronologically ascending by `hour`.

3. **Revenue Trends Pipeline (feeds Line Chart):**
   - Pre-computation: Generates the trailing 6 calendar month strings (`YYYY-MM`) dynamically.
   - Stage 1 (`$match`): Filters for `status: 'completed'` and `date >= `${startMonth}-01``.
   - Stage 2 (`$lookup`): Joins with `doctors` collection to look up the doctor associated with each appointment.
   - Stage 3 (`$unwind`): Unwinds the single matched doctor document.
   - Stage 4 (`$group`): Groups by month string (`$substrCP: ['$date', 0, 7]`) and sums `doctorDoc.consultationFee`.
   - Stage 5 (`$project`): Projects `{ month: '$_id', revenue: 1 }`.
   - Stage 6 (`$sort`): Sorts chronologically by month.
   - Zero-fill mapping: Maps over the 6 computed months and fills missing months with `revenue: 0` in ~8 lines of JavaScript.

### 3.2 Frontend Dashboard (`frontend/src/pages/admin/AnalyticsDashboard.jsx`)

- **Data Fetching & Lifecycle:**
  - Loads data on mount using `getAnalytics()` through the existing Axios instance with auth token header.
  - Near-real-time updates: `setInterval` triggers a background refresh every 60,000 ms (60 seconds) without flashing full-page loading indicators on repeat polls.
  - Interval cleanup: `return () => clearInterval(interval)` ensures no memory leaks on unmount.
- **State Handling:**
  - Loading: Renders `<Spinner label="Loading analytics..." />` during initial fetch.
  - Error: Renders `<Alert>{error}</Alert>` upon API rejection.
  - Empty: Each card checks array length and displays clear fallback text if no records exist.
- **Visual Charts (Recharts):**
  - **Utilization:** `BarChart` wrapped in `ResponsiveContainer` displaying bars for Completed consultations (`#0d9488`), Cancelled (`#ef4444`), and Total Booked (`#94a3b8`).
  - **Peak Hours:** `AreaChart` with smooth gradient area fill (`#0d9488`), formatted hour ticks (`09:00`, `14:00`), and interactive tooltip.
  - **Revenue Trends:** `LineChart` showing 6-month revenue progression with styled data points, grid lines, and currency-formatted tooltip.

### 3.3 Wiring & Routing

- `backend/routes/adminRoutes.js`: Exposes `/analytics` under `protect` and `authorize('admin')`.
- `backend/server.js`: Mounts router via `app.use('/api/admin', require('./routes/adminRoutes'))`.
- `frontend/src/api/adminApi.js`: Adds `getAnalytics = () => unwrap(api.get('/admin/analytics'))`.
- `frontend/src/App.jsx`: Adds `<Route path="/admin/analytics" element={<AnalyticsDashboard />} />` under `<ProtectedRoute roles={['admin']}>`.
- `frontend/src/components/common/Layout.jsx`: Adds `['/admin/analytics', 'Analytics']` to the admin sidebar navigation.
- `frontend/package.json`: Added `recharts`.

---

## 4. API Contract

### Endpoint: `GET /api/admin/analytics`

- **Authentication:** Bearer JWT required in `Authorization` header (`Bearer <token>`).
- **Authorization:** `role: 'admin'` only.
- **Status Codes:**
  - `200 OK`: Successful retrieval.
  - `401 Unauthorized`: Token missing or invalid.
  - `403 Forbidden`: Authenticated user is not an admin.

### Example Response:

```json
{
  "success": true,
  "message": "Analytics retrieved",
  "data": {
    "utilization": [
      {
        "name": "General Medicine",
        "total": 5,
        "completed": 4,
        "cancelled": 0,
        "rate": 80.0
      },
      {
        "name": "Cardiology",
        "total": 3,
        "completed": 2,
        "cancelled": 1,
        "rate": 66.7
      },
      {
        "name": "Neurology",
        "total": 2,
        "completed": 2,
        "cancelled": 0,
        "rate": 100.0
      }
    ],
    "peakHours": [
      { "hour": 9, "count": 4 },
      { "hour": 10, "count": 1 },
      { "hour": 11, "count": 1 },
      { "hour": 14, "count": 1 },
      { "hour": 15, "count": 1 },
      { "hour": 16, "count": 1 }
    ],
    "revenue": [
      { "month": "2026-05", "revenue": 1000 },
      { "month": "2026-06", "revenue": 0 },
      { "month": "2026-07", "revenue": 500 },
      { "month": "2026-08", "revenue": 800 },
      { "month": "2026-09", "revenue": 1500 },
      { "month": "2026-10", "revenue": 1300 }
    ]
  }
}
```

---

## 5. How to Test Locally

1. **Start MongoDB and Backend:**
   ```bash
   cd backend
   npm ci
   cp .env.example .env
   # Ensure MONGO_URI and JWT_SECRET are set
   npm run seed
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   cd frontend
   npm ci
   cp .env.example .env
   npm run dev
   ```

3. **Verify API Endpoints via curl:**
   ```bash
   # Test 1: Unauthenticated request (401)
   curl -i http://localhost:5000/api/admin/analytics

   # Test 2: Login as Admin and query analytics (200)
   ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"change_me_please"}' \
     | grep -o '"token":"[^"]*' | cut -d'"' -f4)

   curl -i -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:5000/api/admin/analytics
   ```

4. **Verify Frontend UI:**
   - Log in as admin (`admin@example.com` / `change_me_please`).
   - Click the **Analytics** link in the left sidebar navigation (or go to `http://localhost:5173/admin/analytics`).
   - Confirm all three charts (Utilization, Peak Hours, Revenue Trends) render properly.

5. **Run Frontend Tests and Production Build:**
   ```bash
   cd frontend
   npm test
   npm run build
   ```

---

## 6. Assumptions & Limitations

1. **Revenue Source (Decision Rule 3.b):** The `Appointment` model has no fee field, whereas the `Doctor` model defines `consultationFee: { type: Number, min: 0, default: 0 }`. Revenue is calculated by joining the doctor associated with each appointment and summing their `consultationFee`.
2. **Completed Consultations for Revenue:** Only appointments with status `'completed'` are included in revenue calculation, since cancelled appointments incur no consultation fee and booked appointments are not yet realized.
3. **Peak Hours Filtering:** Cancelled appointments are excluded from peak hours (`status: { $ne: 'cancelled' }`) so the chart accurately reflects actual slot utilization demand.
4. **Trailing 6-Month Window & Zero-Filling:** Revenue covers the current month and previous 5 months. Months without completed appointments are populated with `0` revenue to prevent broken line graphs.
5. **Near-Real-Time via Polling:** In accordance with the prompt guidelines, near-real-time synchronization is implemented via 60-second polling (`setInterval`) rather than WebSockets/SSE (which belongs to issue #11).

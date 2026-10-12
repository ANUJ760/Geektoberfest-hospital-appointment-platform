# Issue #13: Redis Caching Layer for Doctor Search & Department Queries

## 1. Summary

**Issue #13 Objective:** Integrate Redis caching for `GET /api/departments` and `GET /api/doctors` with automatic cache invalidation when data updates.

**Delivered:**
- Caching configuration module (`backend/config/redis.js`) using `ioredis` with fail-safe resilience settings (lazy connection, short timeout, offline queue disabled, error handling, and silent try/catch fallbacks). When `REDIS_URL` is omitted, caching is completely disabled and all helpers act as transparent no-ops.
- Caching in `departmentController.js` for `GET /api/departments` using key `departments:all` and invalidation (`departments:*` and `doctors:*`) upon department creation, modification, or deactivation.
- Caching in `doctorController.js` for `GET /api/doctors` using deterministic serialized keys based on role and sorted query parameters (`doctors:role=<role>:<sorted_params>`), and invalidation (`doctors:*`) upon doctor creation, profile updates, administrative modifications, or deactivation.
- Invalidation at external write call sites: doctor registration in `authController.js` (`doctors:*`) and doctor user profile update/deactivation in `userController.js` (`doctors:*`).
- Added optional `REDIS_URL=` configuration in `backend/.env.example`.
- Verified 100% zero behavior change for API consumers: status codes, response JSON shapes, field values, and ordering are identical with and without cache.

---

## 2. Files Changed

| File | New / Modified | Purpose |
| :--- | :--- | :--- |
| `backend/config/redis.js` | New | Redis client configuration and `getCache`, `setCache`, `clearCache` helpers with fail-safe degradation. |
| `backend/controllers/departmentController.js` | Modified | Added cache lookup/population for `GET /api/departments` and invalidation for department write operations. |
| `backend/controllers/doctorController.js` | Modified | Added deterministic key generator, cache lookup/population for `GET /api/doctors`, and invalidation for doctor write operations. |
| `backend/controllers/authController.js` | Modified | Added invalidation of `doctors:*` when a doctor registers via public auth endpoint. |
| `backend/controllers/userController.js` | Modified | Added invalidation of `doctors:*` when an admin modifies or deactivates a user with role `doctor`. |
| `backend/.env.example` | Modified | Documented optional `REDIS_URL` environment variable. |
| `backend/package.json` | Modified | Added `ioredis` dependency. |
| `backend/package-lock.json` | Modified | Locked `ioredis` and transitive dependencies. |
| `ISSUE_13_CHANGES.md` | New | Comprehensive implementation, architectural design, and verification documentation. |

---

## 3. Code Walkthrough

### 3.1 Redis Configuration (`backend/config/redis.js`)
- **Connection Configuration:**
  - Evaluates `process.env.REDIS_URL`. If unset, `client` remains `null`, gracefully disabling caching without throwing or crashing.
  - When `REDIS_URL` is provided, initializes an `ioredis` client with:
    - `lazyConnect: true`: prevents connection failures at boot from blocking application startup.
    - `maxRetriesPerRequest: 1`: prevents requests from stalling if Redis becomes unresponsive.
    - `enableOfflineQueue: false`: immediately rejects commands when disconnected instead of buffering them in memory.
    - `connectTimeout: 2000`: 2-second timeout preventing network stalls.
    - Connection warning deduplication: logs error messages only on state changes rather than on every incoming HTTP request.
- **Helper Functions:**
  - `getCache(key)`: Queries Redis via `client.get(key)`. If key exists, parses and returns JSON. On any Redis error or cache miss, catches silently and returns `null`.
  - `setCache(key, value, ttlSeconds = 300)`: Serializes payload via `JSON.stringify(value)` and stores with an expiration time (`EX`). Silently catches and ignores errors.
  - `clearCache(pattern)`: Performs pattern matching using a non-blocking, cursor-based `SCAN` loop with `COUNT 100` (strictly avoiding the blocking `KEYS` command). Deletes matching keys via `UNLINK` (falling back to `DEL`). Silently catches and ignores errors.

### 3.2 Department Controller (`backend/controllers/departmentController.js`)
- `listDepartments`: Checks `getCache('departments:all')`. If cached, returns HTTP 200 with cached payload immediately. If cache miss, executes existing query (`Department.find({ isActive: true }).sort({ name: 1 })`), stores payload via `setCache('departments:all', payload, 300)`, and responds.
- Write Operations (`createDepartment`, `updateDepartment`, `deactivateDepartment`): After MongoDB write succeeds, executes:
  ```javascript
  await clearCache('departments:*');
  await clearCache('doctors:*');
  ```
  Department changes clear `doctors:*` because doctor documents populate and embed department names.

### 3.3 Doctor Controller (`backend/controllers/doctorController.js`)
- Key Serialization (`buildDoctorCacheKey`):
  Sorts all query parameter keys alphabetically and serializes them along with the requester's role (`req.user.role`):
  `doctors:role=<role>:<param1>=<val1>&<param2>=<val2>`
  Ensures query parameter order invariance (e.g. `?search=A&department=B` and `?department=B&search=A` resolve to the exact same cache key).
- `listDoctors`: Checks cache using the deterministic key. On miss, queries MongoDB with populated fields, saves to Redis via `setCache(cacheKey, payload, 300)`, and responds.
- Write Operations (`createDoctor`, `updateMyProfile`, `updateDoctor`, `deactivateDoctor`): Calls `clearCache('doctors:*')` after database operations succeed.

### 3.4 Outside Invalidation Sites
- `authController.js` (`register`): When a new user registers with `role: 'doctor'`, calls `await clearCache('doctors:*')`.
- `userController.js` (`updateUser`, `deactivateUser`): When an admin updates user fields (such as name, phone, or `isActive`) or deactivates an account where `user.role === 'doctor'`, calls `await clearCache('doctors:*')`.

---

## 4. Cache Design & Invalidation Matrix

### Key Formats
- Departments: `departments:all`
- Doctors: `doctors:role=<role>:<sorted_query_string>` (e.g., `doctors:role=patient:department=123&search=smith`)

### Response Variance Dimensions
- **Role Variance:** Admin users can pass `includeInactive=true` to retrieve deactivated doctors (`isActive: false`), whereas patient and doctor roles only see active doctors. Incorporating `role` in the key (`doctors:role=admin:...` vs `doctors:role=patient:...`) guarantees no cache leakage across privilege boundaries.
- **Query Parameter Variance:** Query keys are sorted alphabetically before string concatenation, preventing duplicate cache entries caused by parameter reordering.

### Invalidation Matrix

| Action | Target Endpoint | Keys Cleared | Reason |
| :--- | :--- | :--- | :--- |
| Create Department | `POST /api/departments` | `departments:*`, `doctors:*` | New department available in department list and doctor associations. |
| Update Department | `PUT /api/departments/:id` | `departments:*`, `doctors:*` | Department name or active status changes affect both department list and doctor populated references. |
| Deactivate Department | `DELETE /api/departments/:id` | `departments:*`, `doctors:*` | Department removed from active lists. |
| Create Doctor (Admin) | `POST /api/doctors` | `doctors:*` | New doctor visible in doctor list. |
| Register Doctor (Public) | `POST /api/auth/register` | `doctors:*` | Newly registered doctor profile created. |
| Doctor Update Profile | `PUT /api/doctors/me/profile` | `doctors:*` | Specialization, experience, or fees updated. |
| Admin Update Doctor | `PUT /api/doctors/:id` | `doctors:*` | Admin modified doctor details. |
| Admin Deactivate Doctor | `DELETE /api/doctors/:id` | `doctors:*` | Doctor soft-deleted (`isActive: false`). |
| Admin Update Doctor User | `PUT /api/users/:id` | `doctors:*` | Doctor's name or phone changed on User record. |
| Admin Deactivate User | `DELETE /api/users/:id` | `doctors:*` | Doctor's user account deactivated. |

---

## 5. How to Run and Test Locally

1. **Start Redis Server:**
   ```bash
   redis-server --port 6379
   ```

2. **Configure Environment:**
   In `backend/.env`:
   ```env
   REDIS_URL=redis://127.0.0.1:6379
   ```

3. **Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```

4. **Verify Caching via curl & redis-cli:**
   ```bash
   # 1. Fetch departments (populates cache)
   curl -i http://localhost:5000/api/departments

   # 2. Inspect key in Redis
   redis-cli get departments:all
   redis-cli ttl departments:all

   # 3. Fetch doctors with authenticated token (populates cache)
   curl -i -H "Authorization: Bearer <TOKEN>" "http://localhost:5000/api/doctors?search=John"

   # 4. View doctor keys in Redis
   redis-cli --scan --pattern "doctors:*"
   ```

5. **Test Graceful Fallback (Redis Down):**
   ```bash
   pkill redis-server
   curl -i http://localhost:5000/api/departments
   # Request succeeds with HTTP 200 from MongoDB with no hangs
   ```

---

## 6. Assumptions & Limitations

1. **Graceful Fallback:** If Redis is down, unconfigured, or unreachable, requests seamlessly fall back to MongoDB with zero user-facing errors or performance penalties.
2. **TTL Safety Net:** All cached entries use a 300-second (5 minute) TTL as a safeguard against edge-case desynchronization.
3. **Cursor-Based Scanning:** Pattern invalidation uses Redis `SCAN` in non-blocking batches of 100 with `UNLINK` to avoid event-loop blocking on high key counts.
4. **Single-Resource Endpoints Uncached:** Specific detail endpoints (`GET /api/departments/:id`, `GET /api/doctors/:id`) remain uncached as specified in the issue scope, focusing caching benefits on high-volume list/search queries.

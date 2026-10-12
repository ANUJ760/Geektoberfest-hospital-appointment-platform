# Hospital Appointment Allocation Platform

**SIH Problem Statement:** SIH260136 — Hospital Appointment Allocation Platform

A full-stack MERN application for managing hospital departments, doctor profiles, doctor availability, appointment scheduling, and patient waiting lists.

## Live Deployment

- **Frontend:** https://hospital-appointment-platform-front.vercel.app
- **Login:** https://hospital-appointment-platform-front.vercel.app/login
- **Backend API:** https://hospital-appointment-platform.onrender.com
- **Health check:** https://hospital-appointment-platform.onrender.com/api/health

> The health endpoint reports whether the API and its MongoDB connection are available. If the backend URL changes, update the links above.

## Problem Statement

Hospitals can struggle with inefficient scheduling, conflicting bookings, and underused appointment capacity when bookings are cancelled. This platform aims to provide a baseline system for patients, doctors, and administrators to manage appointments and availability.

- **Patients** can find doctors, view available slots, book appointments, manage appointments, and join waiting lists.
- **Doctors** can publish availability, view appointments, and manage their profiles.
- **Administrators** can manage departments, doctors, patients, appointments, and waiting lists.
- **Conflict prevention** uses database-level appointment constraints to prevent duplicate bookings for the same doctor, date, and time slot.
- **Waiting-list reassignment** is designed to offer newly freed slots to eligible waiting patients after cancellation.

## Tech Stack

### Frontend
- React
- Vite
- React Router v7
- Tailwind CSS v4
- Axios

### Backend
- Node.js
- Express.js
- Mongoose
- JSON Web Tokens (JWT)
- bcryptjs
- CORS

### Database
- MongoDB, local or MongoDB Atlas

## Features

### Authentication and Authorization
- JWT-based authentication for patients, doctors, and administrators.
- Password hashing using `bcryptjs`.
- Passwords excluded from API responses.
- Role-based middleware for protected endpoints.

### Patient Portal
- Patient dashboard and appointment statistics.
- Search for doctors by name, department, or specialization.
- View generated availability slots.
- Book appointments with validation against past or duplicate bookings.
- View, filter, and cancel appointments.
- Join and view waiting-list entries.
- Manage profile information.

### Doctor Portal
- View daily and upcoming appointment information.
- Create and manage availability windows and slot durations.
- Filter appointments and update consultation status.
- Manage doctor profile details.

### Admin Portal
- View system statistics.
- Create, update, and deactivate departments.
- Onboard and manage doctor profiles.
- Search patients and manage account status.
- Review appointments and waiting lists.

> Feature descriptions reflect the supplied project documentation. Confirm behavior against the current implementation when testing or contributing.

## Project Structure

```text
hospital-appointment-platform/
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   │   └── seed.js
│   ├── utils/
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

## Deployment

The frontend and backend are deployed separately as modern decoupled services.

| Component | Platform | Root directory | Build command | Run/publish setting |
|---|---|---|---|---|
| Frontend | Vercel | `frontend` | `npm run build` | Output directory: `dist` |
| Backend | Render | `backend` | `npm ci` | Start command: `npm start` |
| Database | MongoDB Atlas | — | — | Connection via `MONGO_URI` |

### Frontend Deployment (Vercel)

1. **Import Repository:** Log in to [Vercel](https://vercel.com/) and click **Add New... > Project**. Import the project repository.
2. **Configure Project Settings:**
   - **Framework Preset:** Vite
   - **Root Directory:** Edit and set to `frontend` (ensure "Include source files outside of the Root Directory" is enabled if necessary).
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm ci` or `npm install`
3. **Environment Variables:**
   - In **Project Settings > Environment Variables**, add:
     ```env
     VITE_API_URL=https://hospital-appointment-platform.onrender.com/api
     ```
   - *Note:* Vite statically injects `VITE_` variables during the build. Whenever you change `VITE_API_URL`, you must trigger a redeploy for the changes to take effect.
4. **Deploy:** Click **Deploy**. Vercel will provision the project and provide your live frontend URL (e.g., `https://hospital-appointment-platform-front.vercel.app`).

### Backend Deployment (Render)

1. **Create Web Service:** In the [Render Dashboard](https://dashboard.render.com/), click **New + > Web Service** and connect the repository.
2. **Configure Service Settings:**
   - **Name:** `hospital-appointment-backend`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Plan:** Free / Starter
3. **Environment Variables:**
   - In the **Environment** tab, configure the following variables:
     ```env
     NODE_ENV=production
     MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/hospital_appointments?retryWrites=true&w=majority
     JWT_SECRET=<generate_a_long_cryptographically_secure_string>
     JWT_EXPIRES_IN=7d
     CLIENT_URL=https://hospital-appointment-platform-front.vercel.app
     ```
   - Render automatically provisions and sets the `PORT` environment variable. Do not hardcode `PORT`.
   - Ensure `CLIENT_URL` matches your exact Vercel frontend URL without trailing slashes. For multiple domains, supply comma-separated values (e.g., `http://localhost:5173,https://hospital-appointment-platform-front.vercel.app`).

### MongoDB Atlas Setup & Troubleshooting

#### 1. Cluster & Database User Setup
1. Create a free-tier M0 cluster in [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Under **Security > Database Access**, add a database user with `Read and write to any database` permissions. Avoid special characters like `@` or `:` in the password, or URL-encode them.

#### 2. Network Access (IP Whitelisting)
By default, MongoDB Atlas rejects incoming connections from unwhitelisted IP addresses.

- Navigate to **Security > Network Access**.
- Click **Add IP Address**.
- **For Render & Dynamic Cloud Hosts:** Because free/shared cloud platforms (like Render or Vercel serverless functions) utilize dynamically assigned outbound IP addresses, add `0.0.0.0/0` (Allow Access from Anywhere) to permit connections.
- **For Local Development:** Add your current public IP via "Add Current IP Address".

#### 3. Troubleshooting Common Connection Issues
- **`MongooseServerSelectionError: connect ETIMEDOUT` or `MongoServerSelectionError: connection timed out`**:
  - The IP address of the server running the backend is blocked by MongoDB Atlas. Verify that `0.0.0.0/0` is active under **Network Access**.
  - Check whether a corporate firewall or VPN is blocking outbound port `27017`.
- **`MongoServerError: bad auth : authentication failed`**:
  - Verify that the username and password in `MONGO_URI` match the database user created under **Database Access** (not your Atlas dashboard login).
  - URL-encode any special characters in the password (e.g. `@` -> `%40`).
- **CORS / Preflight Failure in Browser**:
  - Verify that `CLIENT_URL` in the backend environment matches the exact origin (scheme + domain) of the deployed frontend.

### Health Check

Open [Backend health check](https://hospital-appointment-platform.onrender.com/api/health). A healthy response returns HTTP 200:

```json
{
  "success": true,
  "message": "API is running",
  "data": {
    "status": "ok",
    "database": "connected"
  }
}
```

If the database is unreachable, the endpoint returns HTTP 503 (`database: "disconnected"`).

## Local Development Setup

### Prerequisites

- Node.js v18 or later (use a Node version supported by the installed Vite version)
- npm
- MongoDB running locally or a MongoDB Atlas connection string

### 1. Clone the repository

```bash
git clone https://github.com/tanishqkale91-cmd/hospital-appointment-platform.git
cd hospital-appointment-platform
```

### 2. Set up the backend

```bash
cd backend
npm ci
cp .env.example .env
```

Update `backend/.env` for your environment. For local MongoDB, the example URI is:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/hospital_appointments
JWT_SECRET=<your local development secret>
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<choose a strong local admin password>
```

Seed the initial admin account and departments if required:

```bash
npm run seed
```

Start the backend:

```bash
npm run dev
```

The backend defaults to port `5000`.

### 3. Set up the frontend

Open a second terminal from the repository root:

```bash
cd frontend
npm ci
cp .env.example .env
```

Set `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend development server:

```bash
npm run dev
```

Vite typically serves the frontend at `http://localhost:5173`.

### 4. Build the frontend

From the `frontend/` directory:

```bash
npm run build
```

## API Overview

The following endpoints are documented by the project:

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | API and database health |
| `POST` | `/api/auth/register` | Public | Register a patient or doctor |
| `POST` | `/api/auth/login` | Public | Log in and receive a JWT |
| `GET` | `/api/auth/me` | Authenticated | Get the current user |
| `GET` | `/api/departments` | Public | List active departments |
| `POST` | `/api/departments` | Admin | Create a department |
| `GET` | `/api/doctors` | Authenticated | List/search doctors |
| `GET` | `/api/doctors/:id` | Authenticated | Get doctor details |
| `GET` | `/api/availability/doctor/:doctorId` | Authenticated | Get doctor availability |
| `GET` | `/api/availability/doctor/:doctorId/slots` | Authenticated | Get computed slots for a date |
| `POST` | `/api/availability` | Doctor | Publish availability |
| `POST` | `/api/appointments` | Patient | Book an appointment |
| `GET` | `/api/appointments/my` | Patient | View the patient's appointments |
| `PATCH` | `/api/appointments/:id/cancel` | Patient/Doctor/Admin | Cancel an appointment and trigger waiting-list handling |
| `PATCH` | `/api/appointments/:id/status` | Doctor/Admin | Update appointment status |
| `POST` | `/api/waiting-list` | Patient | Join a waiting list |
| `GET` | `/api/waiting-list/my` | Patient | View waiting-list entries |
| `GET` | `/api/users/stats` | Admin | Get system statistics |

### API Curl Request Examples

Below are representative `curl` commands demonstrating requests to the API for key workflows.

#### 1. System Health Check
```bash
curl -X GET https://hospital-appointment-platform.onrender.com/api/health \
  -H "Accept: application/json"
```

#### 2. Register a Patient
```bash
curl -X POST https://hospital-appointment-platform.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "password": "SecurePassword123!",
    "role": "patient",
    "phone": "+1-555-0199"
  }'
```

#### 3. Log In (Receive JWT)
```bash
curl -X POST https://hospital-appointment-platform.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane.doe@example.com",
    "password": "SecurePassword123!"
  }'
```
*Save the returned `token` from `data.token` for authenticated requests.*

#### 4. Get Current User Profile
```bash
curl -X GET https://hospital-appointment-platform.onrender.com/api/auth/me \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### 5. List Departments
```bash
curl -X GET https://hospital-appointment-platform.onrender.com/api/departments
```

#### 6. Search Doctors
```bash
# Query doctors by department ID or search term
curl -X GET "https://hospital-appointment-platform.onrender.com/api/doctors?search=Cardiology" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### 7. Get Computed Slots for a Doctor
```bash
curl -X GET "https://hospital-appointment-platform.onrender.com/api/availability/doctor/<DOCTOR_ID>/slots?date=2025-04-15" \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```

#### 8. Book an Appointment (Patient)
```bash
curl -X POST https://hospital-appointment-platform.onrender.com/api/appointments \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": "<DOCTOR_ID>",
    "date": "2025-04-15",
    "startTime": "10:00",
    "reason": "Routine cardiac consultation"
  }'
```

#### 9. Cancel an Appointment
```bash
curl -X PATCH https://hospital-appointment-platform.onrender.com/api/appointments/<APPOINTMENT_ID>/cancel \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

#### 10. Join Waiting List
```bash
curl -X POST https://hospital-appointment-platform.onrender.com/api/waiting-list \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": "<DOCTOR_ID>",
    "date": "2025-04-15",
    "notes": "Available anytime during morning hours"
  }'
```

## Basic Workflow

1. **Administrator:** Sign in with a deliberately configured admin account, manage departments, and onboard doctors.
2. **Doctor:** Publish availability windows, for example `09:00–12:00` with 30-minute slots.
3. **Patient:** Register, find a doctor, select an available slot, and book an appointment.
4. **Double-booking check:** Attempt to book the same doctor/date/slot twice and verify that the duplicate is rejected.
5. **Waiting list:** Join a waiting list for a fully booked date, then test the configured reassignment behavior after an appointment is cancelled.

Do not assume example admin credentials work in production. Use the seeder's configured environment values and verify the resulting account securely.

## Security Notes

- Keep `.env` files and secrets out of version control.
- Use unique production secrets and strong database credentials.
- Restrict MongoDB Atlas network access to the narrowest practical range. Avoid leaving `0.0.0.0/0` enabled permanently.
- Allow only trusted frontend origins through `CLIENT_URL`.
- Never use example credentials for a public deployment.
- Do not include real patient data in screenshots, issues, logs, or test fixtures.

## Contributing

1. Fork the repository or create a feature branch.
2. Make focused changes and describe them clearly.
3. Test relevant flows before opening a pull request.
4. Do not commit `.env` files, credentials, or personal patient information.
5. Include screenshots for UI changes where useful.

## License

Add a `LICENSE` file if the project is intended to be distributed under a specific open-source license.

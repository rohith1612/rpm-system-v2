# Remote Patient Monitoring System (RPM)

A real-time remote patient monitoring system that integrates with **Cerner Millennium EHR** via the **SMART on FHIR** standard. The system receives live vitals from IoT devices over **MQTT (HiveMQ)**, stores data in **NeonDB (Serverless PostgreSQL)**, displays real-time dashboards via **WebSockets**, and writes observations back to Cerner's FHIR R4 API.

## Tech Stack

| Layer               | Technology                           |
| ------------------- | ------------------------------------ |
| **Frontend**        | React + TypeScript + Vite            |
| **Backend**         | Python FastAPI                       |
| **Database**        | NeonDB (Serverless PostgreSQL)       |
| **EHR Integration** | Cerner Millennium — SMART on FHIR R4 |
| **IoT Messaging**   | HiveMQ Cloud (MQTT over TLS)         |
| **Real-time UI**    | WebSockets                           |
| **AI Insights**     | Groq API                             |

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** & npm
- A **Cerner Code Console** account (for SMART on FHIR sandbox)
- A **NeonDB** account (free tier)
- A **HiveMQ Cloud** account (free tier)
- A **Groq** API key (for AI health insights)

---

## Setup Guide

### Step 1 — Clone & Install Dependencies

```bash
# Clone the repo
git clone https://github.com/<your-username>/rpm-system-v2.git
cd rpm-system-v2

# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### Step 2 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in every value. Follow the sections below to obtain each credential.

---

## Service Setup — Step-by-Step

### A. Cerner SMART on FHIR App Registration

This gives you the `CLIENT_ID`, `SYSTEM_CLIENT_ID`, `SYSTEM_SECRET`, `CERNER_BASE_URL`, and `CERNER_TOKEN_URL`.

1. Go to the **Cerner Code Console**: [https://code.cerner.com/](https://code.cerner.com/)
2. Sign in or create a free account.
3. Click **"+ New App"** to register a new application.

#### Provider App (User-facing OAuth2 login):

4. Set **App Type** → `Provider`
5. Set **FHIR Spec** → `R4`
6. Add **Redirect URI** → `http://localhost:5173/callback`
7. Under **Product Family**, select **"Millennium"**
8. Select **Scopes**:
   - `user/Patient.read`
   - `user/Observation.read`
   - `user/Observation.write`
   - `user/Encounter.read`
   - `user/Encounter.write`
   - `user/Condition.read`
   - `online_access`
   - `openid`, `profile`, `fhirUser`
   - `launch/patient`
9. Save the app. Copy the **Client ID** → paste into `.env` as `CLIENT_ID`.
10. Note the **FHIR Base URL** and **Token URL** from the app details page → paste into `CERNER_BASE_URL` and `CERNER_TOKEN_URL`.

#### System App (Backend — Client Credentials):

11. Create a **second app** with **App Type** → `System`
12. Select the same FHIR R4 spec and Millennium product family.
13. Select **system-level scopes**:
    - `system/Patient.read`
    - `system/Observation.read`
    - `system/Observation.write`
    - `system/Encounter.read`
14. Save the app. Copy:
    - **Application ID** → `SYSTEM_APP_ID`
    - **Client ID** → `SYSTEM_CLIENT_ID`
    - **Client Secret** → `SYSTEM_SECRET`

---

### B. NeonDB Setup (Serverless PostgreSQL)

This gives you the `DATABASE_URL`.

1. Go to **NeonDB**: [https://neon.tech/](https://neon.tech/)
2. Sign up for a free account (GitHub/Google login works).
3. Click **"New Project"** → name it (e.g., `rpm-system`).
4. Select a region closest to you and click **Create Project**.
5. On the dashboard, go to **"Connection Details"**.
6. Copy the **Connection String** (it looks like `postgresql://neondb_owner:xxx@ep-xxx.neon.tech/neondb?sslmode=require`).
7. Paste it into `.env` as `DATABASE_URL`.
8. Run the migration script to initialize tables:
   ```bash
   cd backend
   python migrate_to_neon.py
   ```

---

### C. HiveMQ Cloud Setup (MQTT Broker)

This gives you `MQTT_BROKER`, `MQTT_USERNAME`, and `MQTT_PASSWORD`.

1. Go to **HiveMQ Cloud**: [https://www.hivemq.com/cloud/](https://www.hivemq.com/cloud/)
2. Sign up for a **free** account.
3. A **free cluster** is automatically created. Go to your cluster's **Overview** page.
4. Copy the **Cluster URL** (e.g., `abc123.s1.eu.hivemq.cloud`) → paste into `.env` as `MQTT_BROKER`.
5. Go to the **"Access Management"** tab.
6. Under **Credentials**, create new credentials:
   - Enter a **Username** → paste into `.env` as `MQTT_USERNAME`
   - Enter a **Password** → paste into `.env` as `MQTT_PASSWORD`
   - Set **Permissions** → `Publish and Subscribe`
7. Click **Save** / **Add**.
8. Leave `MQTT_PORT=8883` (HiveMQ Cloud uses TLS on this port).

---

### D. Groq API Key

1. Go to **Groq Console**: [https://console.groq.com/](https://console.groq.com/)
2. Sign up or log in.
3. Navigate to **API Keys** → **Create API Key**.
4. Copy the key → paste into `.env` as `GROQ_API_KEY`.

---

## Running the Application

### Option A — Using the start script (Windows)

```bash
start1.bat
```

This opens a split Windows Terminal with backend and frontend running side by side.

### Option B — Manual start

**Terminal 1 — Backend:**

```bash
cd backend
..\venv\Scripts\activate
uvicorn main:app --reload
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

### Access the app:

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Project Structure

```
rpm-system-v2/
├── backend/
│   ├── main.py                  # FastAPI entry point
│   ├── config.py                # Centralized env config
│   ├── requirements.txt         # Python dependencies
│   ├── migrate_to_neon.py       # DB migration script (SQLite → NeonDB)
│   ├── database/
│   │   ├── connection.py        # NeonDB connection & table init
│   │   └── models.py            # SQL schema definitions
│   ├── mqtt/
│   │   └── listener.py          # MQTT subscriber (HiveMQ → backend)
│   ├── routers/
│   │   ├── auth.py              # SMART on FHIR OAuth routes
│   │   ├── patients.py          # Patient CRUD + Cerner sync
│   │   ├── vitals.py            # Vitals API endpoints
│   │   ├── beds.py              # Bed assignment routes
│   │   └── websocket.py         # WebSocket broadcast
│   └── services/
│       ├── ai_service.py        # Groq AI health insights
│       ├── alert_service.py     # Vital threshold alerting
│       ├── bed_service.py       # Bed management logic
│       ├── cerner_auto_sync.py  # Automatic FHIR vital sync
│       ├── cerner_queue.py      # Cerner write queue & retry
│       ├── system_token.py      # Client credentials token mgmt
│       └── vitals_service.py    # Vitals processing pipeline
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root component & routing
│   │   ├── api.ts               # Backend API client
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── index.css            # Global styles
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Page-level views
│   │   ├── hooks/               # Custom React hooks (WebSocket, etc.)
│   │   ├── store/               # State management
│   │   └── utils/               # Helper utilities
│   ├── package.json
│   └── vite.config.ts
├── .env.example                 # Template for environment variables
├── .gitignore
├── start1.bat                   # Quick-start script (Windows)
└── README.md                    # You are here
```

---

## Important Notes

- **Never commit .env** — it contains secrets (API keys, DB passwords, MQTT credentials).
- The Cerner sandbox has **rate limits** — avoid rapid-fire API calls during testing.
- `ENABLE_CERNER_AUTO_SYNC=false` by default — enable it only after confirming your Cerner credentials work.
- The `migrate_to_neon.py` script **drops and recreates tables** — only run it for initial setup or a full reset.

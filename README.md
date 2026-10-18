# Nexus Care

Nexus Care is a local-first clinic coordination demo. The browser app stores its
ledger locally and can sync entries to a FastAPI clinic hub when connected. The
hub also serves a simulated patient SMS conversation. A TCP proxy can be placed
between the app and hub to demonstrate slow, unreliable, or unavailable links.
Clinics can send one unit of a reported supply to another clinic from the
network view, an open coordination request, or an emergency alert.
Routine Normal stock reports stay on the device until a clinician chooses
**Sync now** in Sync Status. Low, Critical, and Urgent stock reports and
non-stock events remain eligible for automatic sync.

## Services and ports

| Service | Port | Purpose |
| --- | ---: | --- |
| Clinic hub (FastAPI) | `8000` | Ledger sync, SMS triage API, patient-phone demo page |
| Clinic app (Next.js) | `3000` | Main clinic dashboard |
| Network simulator (optional) | `9000` | Proxy between the app and hub |

Useful local URLs when the services are running:

- Clinic dashboard: <http://localhost:3000>
- Patient SMS demo: <http://localhost:8000/sms>
- Hub health check: <http://localhost:8000/health>
- Interactive API documentation: <http://localhost:8000/docs>
- Recent emergency alerts: <http://localhost:8000/v1/alerts?minutes=30>

The SMS page is a **simulator**, not a connection to a mobile carrier. It sends
messages to the hub's `/v1/sms/inbound` endpoint and displays the demo replies.
A real SMS provider or modem integration is not included.

## Requirements

- Python 3.10 or newer recommended
- Node.js and npm

Install backend dependencies once:

```bash
cd /path/to/nexus
python3 -m pip install -r backend/requirements.txt
```

Install frontend dependencies once:

```bash
cd /path/to/nexus/nexus-care
npm ci
```

Replace `/path/to/nexus` with this repository's directory. In this workspace it
is `/Users/moksha/HTV-nexus-care/nexus`.

## Run locally

Start each service in its own terminal and leave those terminals open.

### Terminal 1: clinic hub backend

From the repository root:

```bash
cd /path/to/nexus
NEXUS_DB=backend/nexus_hub.db python3 -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The hub writes ledger entries and SMS conversation state to
`backend/nexus_hub.db`. You can change the database location with `NEXUS_DB`.
Visit <http://localhost:8000/health>; a healthy server returns `{"ok":true}`.

### Terminal 2: clinic frontend

Configure `nexus-care/.env.local` to use the hub directly:

```dotenv
NEXT_PUBLIC_CLINIC_ID=A
NEXT_PUBLIC_SYNC_URL=http://localhost:8000
NEXT_PUBLIC_SEED_DEMO=true
NEXT_PUBLIC_SYNC_INTERVAL_SECONDS=5
```

Use a clinic ID that exists in the active scenario. Then run:

```bash
cd /path/to/nexus/nexus-care
npm run dev
```

Open <http://localhost:3000>. Restart the frontend after changing `.env.local`.
That file is local configuration; do not commit it.

### Terminal 3: optional network simulator

The simulator is optional. To run the app through the proxy, change
`NEXT_PUBLIC_SYNC_URL` in `nexus-care/.env.local` to
`http://localhost:9000`, then restart the frontend. Start the proxy from the
repository root:

```bash
cd /path/to/nexus
python3 tools/netsim/netsim_proxy.py --listen 9000 --target 127.0.0.1:8000
```

Use its interactive keys:

| Key | Mode |
| --- | --- |
| `n` | Normal |
| `l` | Low bandwidth |
| `o` | Near-zero, intermittent connectivity |
| `f` | Flaky connection |
| `x` | Hard outage |
| `q` | Quit |

The proxy only affects traffic sent through port `9000`. For example, open
<http://localhost:9000/sms> to run the patient SMS simulator through the proxy;
the direct hub URL on port `8000` bypasses it. See
[`tools/netsim/README.md`](tools/netsim/README.md) for mode details and Linux
`tc netem` instructions.

## Run on a local network

To let another device on the same trusted network use the demo:

1. Find the host computer's LAN IP address (on macOS, try
   `ipconfig getifaddr en0`).
2. Start the backend with `--host 0.0.0.0` instead of `127.0.0.1`.
3. Allow the frontend origin in the backend CORS setting. For example, replace
   `HOST_LAN_IP` with the actual address:

   ```bash
   NEXUS_CORS="http://localhost:3000,http://HOST_LAN_IP:3000" \
   NEXUS_DB=backend/nexus_hub.db \
   python3 -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
   ```

4. Set `NEXT_PUBLIC_SYNC_URL` in `.env.local` to
   `http://HOST_LAN_IP:8000`, and start Next.js with
   `npm run dev -- --hostname 0.0.0.0`.
5. Open `http://HOST_LAN_IP:3000` for the clinic app and
   `http://HOST_LAN_IP:8000/sms` for the patient SMS simulator.

For a LAN demo through the proxy, start it with
`--host 0.0.0.0`, set `NEXT_PUBLIC_SYNC_URL` to
`http://HOST_LAN_IP:9000`, and restart the frontend. Only expose these
development servers to a trusted network; do not forward their ports to the
public internet.

## Data and reset

- Hub data is in the SQLite file selected by `NEXUS_DB` (the local run command
  above uses `backend/nexus_hub.db`).
- The browser separately stores its own ledger in IndexedDB (`nexus-care`).
- Clearing the hub database does not clear browser data, and clearing browser
  data does not clear the hub database.

To reset the hub's ledger and SMS sessions, stop the backend first, then run
this **only for the demo database**:

```bash
sqlite3 backend/nexus_hub.db 'DELETE FROM ledger; DELETE FROM sms_sessions; DELETE FROM sqlite_sequence WHERE name = "ledger";'
```

The clinic app may seed demo entries again when `NEXT_PUBLIC_SEED_DEMO=true`.
To clear one browser's local data, remove the `nexus-care` IndexedDB database
from that browser's developer tools.

## Stop the demo

Press `Ctrl+C` in each terminal running the backend, frontend, or proxy.

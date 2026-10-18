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
Inbound SMS and every generated reply are recorded in the hub database; phone
numbers are stored only as keyed hashes. After the patient chooses an area,
the hub relays that conversation to the selected clinic's ledger. The demo
phone keeps a local outbox and transcript in browser storage and retries queued
messages after connectivity returns. SMS text may contain sensitive health
information, so protect the hub database and clinic browser profiles.
SMS gateway integrations should provide a stable `messageId` on retries to
prevent a re-delivered message from advancing the conversation twice.

### Terminal 2: network simulator for Clinic B's backhaul

The proxy shapes only Clinic B's connection to the central hub:

```bash
cd /path/to/nexus
python3 tools/netsim/netsim_proxy.py --listen 9000 --target 127.0.0.1:8000
```

Press `l` for low bandwidth, `o` for intermittent/no service, `f` for cycling
flaky service, and `n` to restore normal service.

### Terminal 3: Clinic B local gateway

This is the local service B can reach even when its upstream backhaul is
unavailable. Its durable database queues ledger entries for the central hub.

```bash
cd /path/to/nexus
NEXUS_DB=backend/clinic_b_hub.db \
NEXUS_UPSTREAM_URL=http://localhost:9000 \
NEXUS_RELAY_INTERVAL_SECONDS=1 \
python3 -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8001
```

On an actual clinic LAN, use `--host 0.0.0.0` and the gateway's LAN address.
For this laptop demo, `localhost` keeps both simulated endpoints on the same
machine.

### Terminal 4: Clinic B dashboard

```bash
cd /path/to/nexus/nexus-care
NEXT_DIST_DIR=.next-b \
NEXT_PUBLIC_CLINIC_ID=B \
NEXT_PUBLIC_SYNC_URL=http://localhost:8001 \
NEXT_PUBLIC_SEED_DEMO=false \
NEXT_PUBLIC_SYNC_INTERVAL_SECONDS=5 \
npm run dev -- --port 3001
```

Open <http://localhost:3001> and select **Patients**. The dashboard syncs to
the local gateway, not the unreliable upstream link.

### Patient phone demo

Open <http://localhost:8001/sms>. This represents SMS arriving at a local
gateway in B's clinic network. Send a conversation and choose Outpost B. The
gateway records each text and reply immediately, and the dashboard can show
the conversation locally even while the proxy is in `o` mode. The gateway
attempts upstream relay every second in small batches; during `f`, entries
can cross during a spark if the complete request fits that window. If a spark
is missed, they remain queued for the next one. `o` is intermittent, so
delivery timing is not guaranteed while it remains selected. When backhaul
returns, queued records are forwarded to the central hub.

For a third browser window showing the central/A side, optionally run the
dashboard directly against port 8000:

```bash
cd /path/to/nexus/nexus-care
NEXT_DIST_DIR=.next-a \
NEXT_PUBLIC_CLINIC_ID=A \
NEXT_PUBLIC_SYNC_URL=http://localhost:8000 \
NEXT_PUBLIC_SEED_DEMO=false \
npm run dev -- --port 3000
```

Then open <http://localhost:3000>. The proxy affects only traffic through port
`9000`; SMS intake to the local B gateway and dashboard sync on port `8001`
stay available in this demo. The local gateway's HTTP intake simulates an
attached SMS gateway; actual carrier/modem integration is not included. See
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

To reset the hub's ledger, SMS sessions, and recorded SMS messages, stop the
backend first, then run this **only for the demo database**:

```bash
sqlite3 backend/nexus_hub.db 'DELETE FROM ledger; DELETE FROM sms_sessions; DELETE FROM sms_messages; DELETE FROM sqlite_sequence WHERE name IN ("ledger", "sms_messages");'
```

The clinic app may seed demo entries again when `NEXT_PUBLIC_SEED_DEMO=true`.
To clear one browser's local data, remove the `nexus-care` IndexedDB database
from that browser's developer tools.

## Stop the demo

Press `Ctrl+C` in each terminal running the backend, frontend, or proxy.

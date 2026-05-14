# Thingbot

Node.js service that simulates industrial assets (boiler, motor, conveyor, cooling pump), pushes telemetry and attributes to **ThingsBoard** over MQTT, and exposes **HTTP webhooks** for voice or automation integrations (for example ElevenLabs tools calling your deployed URL).

## Architecture

- **ThingsBoard Cloud**: dashboards, device RPC (for example `resetAlarms`, `setRunningStatus` / `setValue`), and live telemetry.
- **This service**: in-memory simulation, MQTT clients per device, and Express webhooks that read or update the same in-memory state.

## Requirements

- Node.js 18+ recommended
- Four ThingsBoard device access tokens (one per simulated asset)

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your ThingsBoard tokens and optional settings
npm start
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TB_HOST` | No | ThingsBoard MQTT host (default `eu.thingsboard.cloud`) |
| `TB_TOKEN_BOILER` | Yes* | Access token for device `boiler-01` |
| `TB_TOKEN_MOTOR` | Yes* | Access token for device `motor-01` |
| `TB_TOKEN_CONVEYOR` | Yes* | Access token for device `conv-01` |
| `TB_TOKEN_PUMP` | Yes* | Access token for device `pump-01` |
| `UPDATE_INTERVAL_MS` | No | Simulation and telemetry push interval (default `5000`) |
| `ANOMALY_PROBABILITY` | No | Chance per cooling-pump tick for a flow anomaly (default `0.05` in code if unset) |
| `PORT` | No | HTTP port (default `3000`) |
| `MCP_SERVER_NAME` / `MCP_SERVER_VERSION` | No | Present in `.env.example` for related tooling; this process does not read them |

\*If a token is missing for an asset, MQTT for that asset is skipped; webhooks still work for in-memory state.

## HTTP API (stable contract)

Base URL is your deployment origin. All JSON bodies use `Content-Type: application/json` where applicable.

### `GET /webhook/get_factory_status`

Returns a summary for every simulated machine.

**Response (200)**

```json
{
  "status": "success",
  "factory_summary": [ /* array of machine summaries */ ]
}
```

Each summary object includes at least: `id`, `name`, `type`, `status`, `telemetry`, `activeAlarms`, `lastUpdate`.

### `POST /webhook/get_machine_details`

**Body**

```json
{ "machineId": "boiler-01" }
```

Valid `machineId` values: `boiler-01`, `motor-01`, `conv-01`, `pump-01`.

**Response (200)** — `machine_details` is the same shape as one entry in `factory_summary`.

**Response (404)** — `{ "status": "error", "message": "..." }`

### `POST /webhook/reset_machine_alarms`

**Body**

```json
{ "machineId": "conv-01" }
```

Clears alarms for that asset and triggers a telemetry push.

**Response (200)** — `{ "status": "success", "message": "..." }`

**Response (404)** — `{ "status": "error", "message": "Machine not found" }`

### `POST /webhook/set_machine_status`

**Body**

```json
{ "machineId": "pump-01", "status": "offline" }
```

`status` must be `running` or `offline`.

**Response (200)** — `{ "status": "success", "message": "..." }`

**Response (400)** — invalid `status`.

**Response (404)** — unknown `machineId`.

### `GET /health`

Plain text: `Industrial Webhook Server Active`.

## Demo narrative (voice / agent)

1. Ask for a factory status update → `GET /webhook/get_factory_status`.
2. Ask for details on a specific machine → `POST /webhook/get_machine_details` with `machineId`.
3. Set a machine offline (for example cooling pump) → `POST /webhook/set_machine_status` with `status: "offline"` and watch telemetry on ThingsBoard.
4. Clear alarms on a machine → `POST /webhook/reset_machine_alarms`.

Configure your voice or agent platform to call these exact paths and request bodies so production frontends stay compatible.

## Project layout

| File | Role |
|------|------|
| `server.js` | Express app, webhooks, MQTT wiring, simulation loop |
| `assets.js` | Asset classes, telemetry simulation, alarm helpers |

## License

ISC (see `package.json`).

# 🛰️ TRACKX — Smart GPS Live Tracking & Safety Platform

> **Smart Live Location & Safety Platform for IoT Fleets, Campus Security, and Personal Transit Protection.**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen.svg)](https://leafletjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-blue.svg)](https://sqlite.org)
[![ESP8266](https://img.shields.io/badge/ESP8266-NodeMCU-red.svg)](https://espressif.com)

---

## 1. Project Overview & Hackathon Focus

**TRACKX** is not just a standard GPS locator. It is an end-to-end IoT personal safety and telemetry platform combining:
- Real-time GPS coordinate ingestion and map rendering
- Dynamic perimeter **Geofencing** with boundary breach alarms
- **MPU6050 6-Axis Motion Sensing** for impact/fall/abnormal movement detection
- Hardware and software **Emergency SOS Broadcast** triggers with audible sirens
- Historical **Trip Recreation & Playback Engine**
- Integrated **Turn-by-Turn Navigation** with distance & ETA calculation
- Full hardware compatibility with **ESP8266 NodeMCU**, **NEO-6M GPS**, **MPU6050**, **16x2 I2C LCD**, active buzzer, and LEDs.

---

## 2. Problem Statement & Solution

- **The Problem:** Modern tracking solutions are either fragmented (only GPS without safety sensors), costly proprietary enterprise telematics, or lack rapid emergency dispatch workflows. During emergencies or vehicular impacts, every second counts.
- **The Solution:** TRACKX integrates GPS position, 6-axis inertial motion analysis (detecting sudden deceleration or tilts), autonomous perimeter geofencing, and immediate SOS signaling into a low-cost, open-architecture IoT hardware unit and an interactive web dashboard.

---

## 3. Key Features

1. **Operations Dashboard (`/dashboard`)**:
   - Live Leaflet map with animated radar tracker marker
   - Current velocity, maximum speed, and average speed analytics
   - Haversine-computed daily distance accumulator
   - Real-time satellite count and horizontal dilution of precision (HDOP)
   - Recent safety alerts feed with instant 1-click acknowledgment
   - Dedicated emergency SOS banner and siren audio alerts

2. **Live Tracking Canvas (`/tracking`)**:
   - Full-viewport Leaflet map with dark-matter cartography
   - Dynamic route polyline connecting recent GPS coordinates
   - Auto-follow mode and route bounds fitting
   - Floating telemetry Heads-Up Display (HUD)

3. **Turn-by-Turn Navigation (`/navigation`)**:
   - Interactive destination selection (click map, search, or select campus/emergency presets)
   - Real-world driving routing powered by Open Source Routing Machine (OSRM)
   - Fallback geodesic pathfinder and estimated travel time computation

4. **Trip History & Route Playback (`/history`)**:
   - Table of recorded trips with date, start time, end time, distance, duration, and safety incidents
   - Interactive route replayer with scrubber slider and animated vehicle playback marker
   - Session recorder allowing manual trip start/stop

5. **Incident Center & Alert Dispatch (`/alerts`)**:
   - Severity filtering: `critical` (SOS / Impact), `warning` (Geofence / Tilt), `info` (System)
   - Individual and bulk acknowledgment workflows
   - Audio tone synthesis using the Web Audio API

6. **Geofencing Radar (`/geofence`)**:
   - Click to place safe zones on map
   - Interactive radius slider (100m - 3000m) with real-time visual circle scaling
   - Automated boundary breach detection with intelligent alert cooldown to prevent notification spam
   - Real-time tracker distance calculation relative to safe zone perimeter

7. **Device Telemetry & Hardware Hub (`/device`)**:
   - Device online/offline status calculated from ping timeout
   - Simulated **16x2 I2C Character LCD** display mirroring the physical unit
   - Complete pinout wiring chart and HTTP curl telemetry injector

8. **Hackathon Demo Mode (`/api/demo/*`)**:
   - 1-click step-by-step route simulation across sample campus
   - Auto-drive simulation mode (updates every 3 seconds)
   - Instant force geofence breach button
   - Instant MPU6050 high-G impact simulation
   - Instant physical SOS button simulation

---

## 4. Hardware Architecture

```
                       +-----------------------+
                       |    18650 Battery      |
                       |       (3.7V - 4.2V)   |
                       +-----------+-----------+
                                   |
                                   v
+------------------+     +-------------------+     +--------------------+
|  NEO-6M GPS      |---->|  ESP8266 NodeMCU  |<--->|  MPU6050 Accel/Gyro|
|  UART (D6/D5)    |     |  Wi-Fi Telemetry  |     |  I2C (D2/D1)       |
+------------------+     +---------+---------+     +--------------------+
                                   |
          +------------------------+------------------------+
          |                        |                        |
          v                        v                        v
+--------------------+   +-------------------+   +--------------------+
|  16x2 I2C LCD      |   |  Active Buzzer    |   |  SOS Push Button   |
|  I2C 0x27 (D2/D1)  |   |  & Status LEDs    |   |  Interrupt (D7)    |
+--------------------+   +-------------------+   +--------------------+
```

### Complete Pin Connections:
| Component | NodeMCU Pin | Protocol | Notes |
| :--- | :--- | :--- | :--- |
| **NEO-6M GPS TX** | `D6` (GPIO 12) | UART (SoftwareSerial 9600) | GPS NMEA sentences stream |
| **NEO-6M GPS RX** | `D5` (GPIO 14) | UART | GPS configuration |
| **MPU6050 SDA** | `D2` (GPIO 4) | I2C Data | Shares bus with LCD |
| **MPU6050 SCL** | `D1` (GPIO 5) | I2C Clock | Shares bus with LCD |
| **16x2 LCD SDA** | `D2` (GPIO 4) | I2C Data | Address `0x27` or `0x3F` |
| **16x2 LCD SCL** | `D1` (GPIO 5) | I2C Clock | Clock line |
| **SOS Push Button** | `D7` (GPIO 13) | Digital Input | `INPUT_PULLUP` to GND |
| **Active Buzzer** | `D8` (GPIO 15) | Digital Output | Active HIGH alarm siren |
| **Green Status LED** | `D3` (GPIO 0) | Digital Output | Solid: Online / Blink: Fix |
| **Red Alarm LED** | `D4` (GPIO 2) | Digital Output | Flashes on SOS emergency |
| **Battery ADC** | `A0` (Analog) | ADC Input | Voltage divider for 0-100% |

---

## 5. Software Architecture & Directory Layout

```
TRACKX/
│
├── server.js               # Express application entry point & route registration
├── package.json            # Project dependencies and run scripts
├── README.md               # Complete architecture & deployment documentation
├── .env.example            # Environment template
├── .gitignore              # Git exclusions
│
├── database/
│   ├── database.js         # SQLite connection manager with WAL mode
│   └── schema.sql          # Tables, indexes, and initial seed records
│
├── routes/
│   ├── location.js         # POST /api/location, GET latest, GET history
│   ├── device.js           # GET /api/device/status, GET /api/device
│   ├── alerts.js           # GET /api/alerts, POST /api/alerts, acknowledge
│   ├── geofence.js         # Geofence CRUD and real-time distance checks
│   ├── trips.js            # Trip session recorder and historical points
│   └── demo.js             # Hackathon interactive simulation endpoints
│
├── services/
│   ├── locationService.js  # Haversine distance, coordinate validation, telemetry storage
│   ├── alertService.js     # Severity categorization, sirens, MPU6050 motion parsing
│   ├── geofenceService.js  # Point-in-radius evaluation and breach cooldown state
│   └── tripService.js      # Cumulative distance, duration, and speed analytics
│
├── public/                 # Responsive web frontend (Vanilla HTML5/CSS3/ES6)
│   ├── index.html          # Entry redirect
│   ├── dashboard.html      # Operations center & live telemetry counters
│   ├── tracking.html       # Full-viewport live map tracking canvas
│   ├── navigation.html     # Turn-by-turn pathfinder & route calculator
│   ├── history.html        # Trip history table & animated route playback
│   ├── alerts.html         # Incident dispatch center & filter toolbar
│   ├── geofence.html       # Safe zone boundary editor & radius slider
│   ├── device.html         # Hardware telemetry diagnostics & simulated LCD
│   ├── settings.html       # Backend URL configuration & firmware generator
│   │
│   ├── css/
│   │   └── style.css       # Obsidian dark tech design system & glassmorphism
│   │
│   └── js/
│       ├── api.js          # Centralized API client wrapper
│       ├── app.js          # Topbar polling, status pill, and audio alerts
│       ├── demo.js         # Demo mode simulation controller
│       ├── dashboard.js    # Dashboard view controller
│       ├── tracking.js     # Live tracking HUD and polyline renderer
│       ├── navigation.js   # OSRM router & geodesic fallback engine
│       ├── history.js      # Historical trip replayer
│       ├── alerts.js       # Incident feed manager
│       ├── geofence.js     # Interactive geofence map editor
│       ├── device.js       # Hardware diagnostics controller
│       └── settings.js     # Settings & Arduino config generator
│
├── esp8266/
│   └── trackx_firmware.ino # Ready-to-flash Arduino C++ firmware for NodeMCU
│
└── data/
    └── trackx.db           # SQLite database file
```

---

## 6. Database Schema (SQLite)

- **`devices`**:
  `id`, `device_id` (UNIQUE), `name`, `status`, `battery_level`, `firmware_version`, `last_seen`, `created_at`
- **`locations`**:
  `id`, `device_id`, `latitude`, `longitude`, `speed`, `satellites`, `accuracy`, `motion`, `altitude`, `timestamp`
  - *Indexes on `(device_id, timestamp DESC)` and `(timestamp DESC)`*
- **`alerts`**:
  `id`, `device_id`, `type` (`SOS`, `GEOFENCE`, `MOTION`, `SYSTEM`), `severity` (`critical`, `warning`, `info`), `message`, `latitude`, `longitude`, `acknowledged`, `timestamp`
  - *Indexes on `(device_id, timestamp DESC)` and `(acknowledged, timestamp DESC)`*
- **`geofences`**:
  `id`, `name`, `latitude`, `longitude`, `radius`, `active`, `color`, `created_at`
- **`trips`**:
  `id`, `device_id`, `title`, `start_time`, `end_time`, `distance`, `duration`, `average_speed`, `max_speed`, `alert_count`, `status`

---

## 7. REST API Documentation

### GPS Telemetry Ingestion (ESP8266 & Simulator)
- **`POST /api/location`**
  ```json
  {
    "deviceId": "TRACKX-01",
    "latitude": 21.1458,
    "longitude": 79.0882,
    "speed": 32.5,
    "satellites": 8,
    "accuracy": 3.2,
    "motion": "NORMAL",
    "altitude": 310.5,
    "battery": 95.0
  }
  ```
  *Response:* `201 Created` with saved location record and automated geofence breach evaluation.

- **`GET /api/location/latest?deviceId=TRACKX-01`**
  *Response:* Most recent GPS coordinates, device status, and daily distance/speed stats.

- **`GET /api/location/history?deviceId=TRACKX-01&limit=100`**
  *Response:* Chronological GPS array for polylines and route reconstruction.

### Device & Telemetry State
- **`GET /api/device/status?deviceId=TRACKX-01`**
  *Response:* Computes `ONLINE` or `OFFLINE` status based on configurable ping timeout (default: 60s).

### Safety & Incident Alerts
- **`POST /api/alerts`**
  ```json
  {
    "deviceId": "TRACKX-01",
    "type": "SOS",
    "severity": "critical",
    "message": "EMERGENCY: Hardware SOS Button Triggered!",
    "latitude": 21.1458,
    "longitude": 79.0882
  }
  ```
- **`GET /api/alerts?type=SOS&unacknowledgedOnly=true`**
- **`PATCH /api/alerts/:id/ack`** — Marks alert as acknowledged.
- **`POST /api/alerts/ack-all`** — Bulk acknowledges active alerts.

### Geofencing Safe Zones
- **`GET /api/geofence`** — Lists all safe zones.
- **`POST /api/geofence`** — Creates new safe zone (`name`, `latitude`, `longitude`, `radius`, `color`).
- **`PUT /api/geofence/:id`** — Updates radius or active status.
- **`DELETE /api/geofence/:id`** — Removes safe zone.
- **`GET /api/geofence/status/current`** — Computes tracker inside/outside state and distance to perimeter.

### Historical Trips
- **`GET /api/trips`** — Lists all completed and active trip sessions.
- **`GET /api/trips/:id`** — Retrieves trip metadata and all GPS points for route polyline mapping.
- **`POST /api/trips/start`** — Initiates active trip tracking.
- **`POST /api/trips/stop`** — Finalizes trip and calculates duration, distance, and speeds.

### Hackathon Demo Simulation Controls
- **`POST /api/demo/step`** — Advances device along realistic 16-waypoint test driving loop.
- **`POST /api/demo/breach`** — Forces device outside the safe zone to demonstrate immediate breach alarm.
- **`POST /api/demo/impact`** — Triggers simulated MPU6050 high-G impact event.
- **`POST /api/demo/sos`** — Triggers simulated hardware SOS button press.
- **`POST /api/demo/reset`** — Resets coordinates back to campus center and clears alerts.

---

## 8. Installation & Running Locally

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Steps
1. **Clone or Navigate to the project directory:**
   ```bash
   cd c:\Users\vedant\Desktop\traccker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   *(Default values in `.env` are pre-configured for local testing).*

4. **Start the TRACKX Server:**
   ```bash
   npm start
   ```

5. **Open in Browser:**
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 9. Flashing the ESP8266 NodeMCU Firmware

1. Open the Arduino IDE.
2. In **Board Manager**, ensure `esp8266` by ESP8266 Community is installed.
3. Install required libraries:
   - `TinyGPSPlus` (by Mikal Hart)
   - `LiquidCrystal_I2C` (by Frank de Brabander)
4. Open the firmware sketch located at:
   `esp8266/trackx_firmware.ino`
5. Update your Wi-Fi credentials and server URL:
   ```cpp
   const char* WIFI_SSID       = "YOUR_HOTSPOT_OR_WIFI";
   const char* WIFI_PASSWORD   = "YOUR_PASSWORD";
   const char* SERVER_BASE_URL = "http://YOUR-COMPUTER-IP:3000"; // Or Render URL
   ```
6. Connect NodeMCU via USB and upload at 115200 baud.

---

## 10. Deploying to Render

1. Commit and push the project to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: TRACKX Platform"
   git remote add origin https://github.com/your-username/trackx.git
   git push -u origin main
   ```
2. Log in to [Render.com](https://render.com) and click **New Web Service**.
3. Select your repository.
4. Set:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Deploy. Render will provide a free HTTPS URL:
   `https://trackx-XXXX.onrender.com`
6. Enter this URL in `/settings` on the web interface or directly in the ESP8266 firmware.

---

## 11. Judging Demonstration Walkthrough

During your presentation, follow this 10-step flow:
1. **Device Comes Online:** Open the Dashboard. Observe the `● ONLINE` status pill and satellite fix indicator.
2. **GPS Fix Appears:** The Leaflet map displays the live tracker marker at the Campus Gate coordinates.
3. **Simulate Movement:** Click **"Auto-Drive Simulation"** or **"Step Next Point"** in the Demo Controls bar. Watch the vehicle marker smoothly move along the road and draw the cyan trail polyline.
4. **Speed & Distance Update:** Observe the Speed gauge dynamically updating (`18 km/h` → `45 km/h`) and distance accumulating.
5. **Geofence Breach:** Click **"Force Geofence Breach"**. Watch the vehicle move outside the perimeter, immediately triggering an amber warning and siren tone.
6. **MPU6050 Motion Sensing:** Click **"MPU6050 Impact"**. Notice the motion card switch to `IMPACT DETECTED` and an incident get logged.
7. **Emergency SOS Trigger:** Click **"Push SOS Button"**. The top emergency red flash banner appears, the audible alarm beeps, and the incident center logs the critical event.
8. **Navigation:** Navigate to `/navigation`. Click anywhere on the map or select "Emergency Hospital" to see the turn-by-turn driving route and ETA.
9. **Trip History & Playback:** Navigate to `/history`. Select a recorded trip and click **"Play Route"** to watch the vehicle re-trace its path on the map timeline slider.
10. **Hardware Mirroring:** Navigate to `/device`. Show judges the live **16x2 I2C LCD Mirror** and the wiring schematic.

---

## 12. Future Scope

- Cellular GSM / 4G LTE fallback (SIM800L / A7670C) for areas without Wi-Fi.
- On-board microSD black-box logging when offline.
- Deep-sleep power management for up to 2-week battery endurance on a single 18650 cell.
- Twilio SMS / WhatsApp API integration for emergency contacts.

---

## License
MIT License. Developed for the Smart Campus IoT Hackathon.

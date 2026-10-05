/**
 * TRACKX Device & Hardware Telemetry Controller
 * Displays ESP8266 telemetry, sensor diagnostics, and simulated 16x2 I2C LCD.
 */
const DeviceController = {
  pollTimer: null,

  init() {
    this.loadDeviceInfo();
    this.pollTimer = setInterval(() => this.loadDeviceInfo(), 2500);
  },

  async loadDeviceInfo() {
    try {
      const deviceId = API.getActiveDeviceId();
      const res = await API.get('/api/device/status', { deviceId });
      if (res.success && res.data) {
        this.renderTelemetry(res.data);
      }
    } catch (e) {
      console.error('Device load error:', e);
    }
  },

  renderTelemetry(dev) {
    // Basic fields
    const idEl = document.getElementById('devIdDisplay');
    const nameEl = document.getElementById('devNameDisplay');
    const statusPill = document.getElementById('devStatusPillDisplay');
    const gpsStatusEl = document.getElementById('devGpsStatusDisplay');
    const lastSeenEl = document.getElementById('devLastSeenDisplay');
    const satsEl = document.getElementById('devSatsDisplay');
    const coordsEl = document.getElementById('devCoordsDisplay');
    const speedEl = document.getElementById('devSpeedDisplay');
    const battEl = document.getElementById('devBatteryDisplay');
    const fwEl = document.getElementById('devFwDisplay');

    if (idEl) idEl.textContent = dev.deviceId;
    if (nameEl) nameEl.textContent = dev.name;
    if (fwEl) fwEl.textContent = dev.firmwareVersion || 'v1.2.0';

    if (statusPill) {
      statusPill.className = `status-pill ${dev.isOnline ? 'online' : 'offline'}`;
      statusPill.innerHTML = `<span class="status-dot"></span> ${dev.status}`;
    }

    if (gpsStatusEl) {
      const isFix = dev.gpsStatus === 'CONNECTED';
      gpsStatusEl.className = `badge ${isFix ? 'badge-success' : 'badge-warning'}`;
      gpsStatusEl.textContent = dev.gpsStatus;
    }

    if (lastSeenEl) {
      if (dev.lastSeen) {
        const d = new Date(dev.lastSeen);
        lastSeenEl.textContent = `${d.toLocaleTimeString()} (${dev.secondsSinceLastSeen}s ago)`;
      } else {
        lastSeenEl.textContent = 'Never';
      }
    }

    if (battEl) {
      const b = dev.batteryLevel ? Math.round(dev.batteryLevel) : 100;
      battEl.textContent = `${b}% (~4.12V Li-ion)`;
    }

    if (dev.telemetry) {
      if (satsEl) satsEl.textContent = `${dev.telemetry.satellites} Locked`;
      if (coordsEl) coordsEl.textContent = `${dev.telemetry.latitude.toFixed(5)}, ${dev.telemetry.longitude.toFixed(5)}`;
      if (speedEl) speedEl.textContent = `${Math.round(dev.telemetry.speed || 0)} km/h`;

      // Update 16x2 simulated LCD display
      this.updateLcdPreview(dev);
    } else {
      if (satsEl) satsEl.textContent = '0 (Acquiring)';
      if (coordsEl) coordsEl.textContent = 'Waiting for fix...';
      if (speedEl) speedEl.textContent = '0 km/h';
    }
  },

  currentScreenIdx: 0,
  lcdTimer: null,
  latestDevData: null,

  updateLcdPreview(dev) {
    this.latestDevData = dev;
    if (!this.lcdTimer) {
      // Rotate LCD screen every 2.5 seconds
      this.lcdTimer = setInterval(() => {
        this.currentScreenIdx = (this.currentScreenIdx + 1) % 5;
        this.renderLcdScreen();
      }, 2500);
    }
    this.renderLcdScreen();
  },

  renderLcdScreen() {
    const line1El = document.getElementById('lcdLine1');
    const line2El = document.getElementById('lcdLine2');
    const screenBadge = document.getElementById('lcdScreenBadge');

    if (!line1El || !line2El || !this.latestDevData) return;

    const dev = this.latestDevData;
    const t = dev.telemetry || {
      latitude: 21.1458,
      longitude: 79.0882,
      speed: 0,
      satellites: 8,
      altitude: 310,
      accuracy: 2.8,
      motion: 'NORMAL'
    };

    const speed = Math.round(t.speed || 0);
    const sats = t.satellites || 0;
    const status = dev.isOnline ? 'ONLINE' : 'OFFLINE';
    const lat = t.latitude || 21.1458;
    const lon = t.longitude || 79.0882;
    const batt = Math.round(dev.batteryLevel || 98);
    const volts = (3.5 + (batt / 100) * 0.7).toFixed(1);
    const motion = t.motion || 'NORMAL';
    const alt = Math.round(t.altitude || 310);
    const hdop = parseFloat(t.accuracy || 2.8).toFixed(1);

    let l1 = '';
    let l2 = '';
    let badgeText = '';

    switch (this.currentScreenIdx) {
      case 0:
        badgeText = '1/5: Status & Speed';
        l1 = `TRACKX: ${status.padEnd(8, ' ')}`;
        l2 = `S:${String(speed).padStart(2, '0')}km/h SAT:${String(sats).padStart(2, ' ')}`;
        break;

      case 1:
        badgeText = '2/5: GPS Coordinates';
        l1 = `LAT:${lat.toFixed(5).padStart(12, ' ')}`;
        l2 = `LON:${lon.toFixed(5).padStart(12, ' ')}`;
        break;

      case 2:
        badgeText = '3/5: MPU6050 Motion';
        if (motion === 'POSSIBLE_IMPACT') {
          l1 = `!IMPACT DETECTED`;
          l2 = `HIGH-G SPIKE!   `;
        } else if (motion === 'ABNORMAL') {
          l1 = `MOTION: ABNORMAL`;
          l2 = `TILT/JERK DETECT`;
        } else {
          l1 = `MOTION: NORMAL  `;
          l2 = `MPU6050: 0.98G  `;
        }
        break;

      case 3:
        badgeText = '4/5: Battery & IP';
        l1 = `BATT: ${String(batt).padStart(2, ' ')}% [${volts}V]`;
        l2 = `IP:192.168.1.50 `;
        break;

      case 4:
        badgeText = '5/5: Altitude & Fix';
        l1 = `ALTITUDE: ${String(alt).padStart(4, ' ')}m`;
        l2 = `HDOP: +/-${hdop}m   `;
        break;
    }

    line1El.textContent = l1.slice(0, 16).padEnd(16, ' ');
    line2El.textContent = l2.slice(0, 16).padEnd(16, ' ');
    if (screenBadge) screenBadge.textContent = badgeText;
  },

  setScreen(idx) {
    this.currentScreenIdx = idx;
    this.renderLcdScreen();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  DeviceController.init();
});

window.DeviceController = DeviceController;

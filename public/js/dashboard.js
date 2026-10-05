/**
 * TRACKX Dashboard Page Controller
 * Manages live overview map, telemetry cards, and safety alert stream.
 */
const DashboardController = {
  map: null,
  marker: null,
  pathLine: null,
  geofenceCircle: null,
  recentPoints: [],
  pollTimer: null,

  init() {
    this.initMap();
    this.fetchData();
    this.pollTimer = setInterval(() => this.fetchData(), 2500);

    // Listen to demo mode instant simulation events
    window.addEventListener('trackx:telemetry-update', (e) => {
      if (e.detail) {
        this.updateTelemetryUi(e.detail);
        this.updateMapPosition(e.detail.latitude, e.detail.longitude, e.detail.speed);
      }
    });
  },

  initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    // Default center: Campus coordinates
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([21.1458, 79.0882], 15);

    // OpenStreetMap standard tile layer (100% free, no API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // Add zoom control in top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Custom pulsing radar icon
    const radarIcon = L.divIcon({
      className: 'custom-radar-icon',
      html: `
        <div class="radar-marker">
          <div class="radar-wave"></div>
          <div class="radar-core"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    this.marker = L.marker([21.1458, 79.0882], { icon: radarIcon }).addTo(this.map);
    this.marker.bindPopup(`
      <div style="font-family: var(--font-body); color: #0f172a; padding: 4px;">
        <b style="font-size: 13px; color: #2563eb;">TRACKX Live Unit #1</b><br>
        <span style="font-size: 12px; color: #64748b;">Initializing GPS fix...</span>
      </div>
    `);

    // Dynamic track polyline
    this.pathLine = L.polyline([], {
      color: '#38bdf8',
      weight: 4,
      opacity: 0.85,
      smoothFactor: 1
    }).addTo(this.map);

    // Load active geofence overlay
    this.loadGeofences();
  },

  async loadGeofences() {
    try {
      const res = await API.get('/api/geofence');
      if (res.success && res.data && res.data.length > 0) {
        const gf = res.data[0]; // Primary safe zone
        if (this.geofenceCircle) {
          this.map.removeLayer(this.geofenceCircle);
        }
        this.geofenceCircle = L.circle([gf.latitude, gf.longitude], {
          radius: gf.radius,
          color: gf.color || '#10b981',
          fillColor: gf.color || '#10b981',
          fillOpacity: 0.12,
          weight: 2,
          dashArray: '6, 8'
        }).addTo(this.map);
        this.geofenceCircle.bindTooltip(`Safe Zone: ${gf.name} (${gf.radius}m)`, { permanent: false, direction: 'top' });
      }
    } catch (e) {
      console.warn('Could not load geofences:', e);
    }
  },

  async fetchData() {
    try {
      const deviceId = API.getActiveDeviceId();

      // 1. Latest location and stats
      const locRes = await API.get('/api/location/latest', { deviceId });
      if (locRes.success) {
        if (locRes.data) {
          this.updateTelemetryUi(locRes.data);
          this.updateMapPosition(locRes.data.latitude, locRes.data.longitude, locRes.data.speed);
        }
        if (locRes.stats) {
          this.updateStatsUi(locRes.stats);
        }
      }

      // 2. Recent alerts table
      const alertRes = await API.get('/api/alerts', { deviceId, limit: 5 });
      if (alertRes.success) {
        this.renderAlertsTable(alertRes.data);
      }

      // 3. Geofence status check
      const gfRes = await API.get('/api/geofence/status/current', { deviceId });
      if (gfRes.success && gfRes.geofences && gfRes.geofences.length > 0) {
        const primaryGf = gfRes.geofences[0];
        const statusEl = document.getElementById('cardGeofenceStatus');
        if (statusEl) {
          const isInside = primaryGf.status === 'INSIDE';
          statusEl.innerHTML = `
            <span class="badge ${isInside ? 'badge-success' : 'badge-critical'}">
              ${primaryGf.status}
            </span>
            <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">
              ${primaryGf.name} (${primaryGf.distanceMeters}m from center)
            </span>
          `;
        }
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  },

  updateTelemetryUi(data) {
    // Current Speed
    const speedEl = document.getElementById('cardSpeed');
    if (speedEl) {
      const spd = Math.round(data.speed || 0);
      speedEl.innerHTML = `${spd} <span class="metric-unit">km/h</span>`;
    }

    // Coordinates
    const coordsEl = document.getElementById('cardCoordinates');
    if (coordsEl) {
      const lat = parseFloat(data.latitude).toFixed(4);
      const lon = parseFloat(data.longitude).toFixed(4);
      coordsEl.textContent = `${lat}, ${lon}`;
    }

    // Satellites and Accuracy
    const satsEl = document.getElementById('cardSatellites');
    if (satsEl) {
      const sats = data.satellites || 0;
      const acc = data.accuracy ? `±${parseFloat(data.accuracy).toFixed(1)}m` : '±3.0m';
      satsEl.innerHTML = `${sats} <span class="metric-unit">Sats • ${acc}</span>`;
    }

    // Last Update Timestamp
    const lastUpdateEl = document.getElementById('cardLastUpdate');
    if (lastUpdateEl && data.timestamp) {
      const updateDate = new Date(data.timestamp);
      const timeStr = updateDate.toLocaleTimeString([], { hour12: false });
      const secAgo = Math.max(0, Math.round((Date.now() - updateDate.getTime()) / 1000));
      lastUpdateEl.innerHTML = `${timeStr} <span class="metric-unit">(${secAgo}s ago)</span>`;
    }

    // Motion Sensor (MPU6050)
    const motionEl = document.getElementById('cardMotion');
    if (motionEl) {
      const motion = data.motion || 'NORMAL';
      if (motion === 'POSSIBLE_IMPACT') {
        motionEl.innerHTML = '<span class="badge badge-critical">IMPACT DETECTED</span>';
      } else if (motion === 'ABNORMAL') {
        motionEl.innerHTML = '<span class="badge badge-warning">ABNORMAL TILT</span>';
      } else {
        motionEl.innerHTML = '<span class="badge badge-info">NORMAL (0.98G)</span>';
      }
    }

    // Device Status Card
    const statusEl = document.getElementById('cardDeviceStatus');
    if (statusEl) {
      const status = data.device_status || 'ONLINE';
      const isOnline = status === 'ONLINE';
      statusEl.innerHTML = `
        <span class="status-pill ${isOnline ? 'online' : 'offline'}">
          <span class="status-dot"></span> ${status}
        </span>
      `;
    }
  },

  updateStatsUi(stats) {
    const distEl = document.getElementById('cardDistance');
    if (distEl) {
      distEl.innerHTML = `${stats.distanceKm || '0.00'} <span class="metric-unit">km</span>`;
    }

    const maxSpeedEl = document.getElementById('cardMaxSpeed');
    if (maxSpeedEl) {
      maxSpeedEl.textContent = `Max: ${stats.maxSpeedKmH || 0} km/h • Avg: ${stats.avgSpeedKmH || 0} km/h`;
    }
  },

  updateMapPosition(lat, lon, speed) {
    if (!this.map || !this.marker) return;

    const newLatLng = new L.LatLng(lat, lon);
    this.marker.setLatLng(newLatLng);

    // Update marker popup content
    this.marker.setPopupContent(`
      <div style="font-family: var(--font-body); color: #0f172a; padding: 4px; min-width: 140px;">
        <b style="font-size: 13px; color: #2563eb;">TRACKX Live Tracker</b><br>
        <div style="margin-top: 4px; font-size: 12px; color: #475569;">
          Speed: <b>${Math.round(speed || 0)} km/h</b><br>
          Lat: ${lat.toFixed(5)}<br>
          Lon: ${lon.toFixed(5)}
        </div>
      </div>
    `);

    // Append to live route polyline
    this.recentPoints.push(newLatLng);
    if (this.recentPoints.length > 40) {
      this.recentPoints.shift();
    }
    this.pathLine.setLatLngs(this.recentPoints);

    // Smoothly pan map if center is far
    const currentCenter = this.map.getCenter();
    const distFromCenter = this.map.distance(currentCenter, newLatLng);
    if (distFromCenter > 400) {
      this.map.panTo(newLatLng, { animate: true, duration: 1 });
    }
  },

  renderAlertsTable(alerts) {
    const tbody = document.getElementById('alertsTableBody');
    if (!tbody) return;

    if (!alerts || alerts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 24px;">No safety events recorded. All systems normal.</td></tr>`;
      return;
    }

    tbody.innerHTML = alerts.map(a => {
      let badgeClass = 'badge-info';
      if (a.severity === 'critical' || a.type === 'SOS') badgeClass = 'badge-critical';
      else if (a.severity === 'warning' || a.type === 'GEOFENCE') badgeClass = 'badge-warning';

      const timeStr = new Date(a.timestamp).toLocaleTimeString([], { hour12: false });

      return `
        <tr>
          <td><span class="badge ${badgeClass}">${a.type}</span></td>
          <td style="font-weight: 500;">${a.message}</td>
          <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted);">
            ${a.latitude ? `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}` : 'N/A'}
          </td>
          <td style="color: var(--text-dim); font-size: 12px;">${timeStr}</td>
          <td>
            ${a.acknowledged ? 
              '<span style="color: var(--status-online); font-size: 12px;">✓ Acked</span>' : 
              `<button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="DashboardController.ackAlert(${a.id})">Acknowledge</button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  },

  async ackAlert(id) {
    try {
      await API.patch(`/api/alerts/${id}/ack`);
      App.showToast(`Alert #${id} acknowledged`, 'info');
      this.fetchData();
    } catch (e) {
      alert(e.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  DashboardController.init();
});

window.DashboardController = DashboardController;

/**
 * TRACKX Dedicated Live Tracking Controller
 * Full-viewport map with dynamic route trail, follow-mode, and HUD telemetry.
 */
const TrackingController = {
  map: null,
  marker: null,
  trackPolyline: null,
  geofenceCircle: null,
  historyPoints: [],
  autoFollow: true,
  showGeofence: true,
  pollTimer: null,
  currentTileLayer: null,

  init() {
    this.initMap();
    this.loadHistory();
    this.bindControls();
    
    // Telemetry polling: every 2 seconds
    this.pollTimer = setInterval(() => this.pollLatest(), 2000);

    // Instant demo event listener
    window.addEventListener('trackx:telemetry-update', (e) => {
      if (e.detail) this.handleNewLocation(e.detail);
    });
  },

  initMap() {
    this.map = L.map('trackingMap', {
      zoomControl: false,
      attributionControl: false
    }).setView([21.1458, 79.0882], 16);

    // Standard OpenStreetMap tile layer (100% free, no API key required)
    this.currentTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Radar pulsing live marker
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
    this.marker.bindPopup('<b style="color:#2563eb;">TRACKX Live NodeMCU Tracker</b>');

    // Glowing track route line
    this.trackPolyline = L.polyline([], {
      color: '#38bdf8',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    this.loadGeofence();
  },

  async loadGeofence() {
    try {
      const res = await API.get('/api/geofence');
      if (res.success && res.data.length > 0) {
        const gf = res.data[0];
        if (this.geofenceCircle) this.map.removeLayer(this.geofenceCircle);
        this.geofenceCircle = L.circle([gf.latitude, gf.longitude], {
          radius: gf.radius,
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.1,
          weight: 2,
          dashArray: '6, 8'
        }).addTo(this.map);
      }
    } catch (e) {
      console.warn('Geofence load error:', e);
    }
  },

  async loadHistory() {
    try {
      const deviceId = API.getActiveDeviceId();
      const res = await API.get('/api/location/history', { deviceId, limit: 100 });
      if (res.success && res.data.length > 0) {
        this.historyPoints = res.data.map(p => [p.latitude, p.longitude]);
        this.trackPolyline.setLatLngs(this.historyPoints);

        const last = res.data[res.data.length - 1];
        this.handleNewLocation(last);

        if (this.historyPoints.length > 1) {
          this.map.fitBounds(this.trackPolyline.getBounds(), { padding: [50, 50] });
        }
      }
    } catch (e) {
      console.warn('History load error:', e);
    }
  },

  async pollLatest() {
    try {
      const deviceId = API.getActiveDeviceId();
      const res = await API.get('/api/location/latest', { deviceId });
      if (res.success && res.data) {
        this.handleNewLocation(res.data);
      }
    } catch (e) {
      console.error('Tracking poll error:', e);
    }
  },

  handleNewLocation(loc) {
    if (!loc || !loc.latitude || !loc.longitude) return;

    const lat = parseFloat(loc.latitude);
    const lon = parseFloat(loc.longitude);
    const speed = Math.round(loc.speed || 0);
    const sats = loc.satellites || 0;
    const acc = loc.accuracy ? parseFloat(loc.accuracy).toFixed(1) : '2.8';
    const alt = loc.altitude ? parseFloat(loc.altitude).toFixed(1) : '310.0';

    const latLng = new L.LatLng(lat, lon);
    this.marker.setLatLng(latLng);

    // Update Popup
    this.marker.setPopupContent(`
      <div style="font-family: var(--font-body); color: #0f172a; padding: 4px; min-width: 150px;">
        <div style="font-weight: 700; color: #2563eb; font-size: 13px;">TRACKX-01 (Active)</div>
        <div style="margin-top: 6px; font-size: 12px; line-height: 1.4;">
          <b>Speed:</b> ${speed} km/h<br>
          <b>Coordinates:</b> ${lat.toFixed(5)}, ${lon.toFixed(5)}<br>
          <b>Satellites:</b> ${sats} (Lock: Stable)<br>
          <b>Accuracy:</b> ±${acc}m<br>
          <b>Altitude:</b> ${alt}m
        </div>
      </div>
    `);

    // Add to polyline
    this.historyPoints.push(latLng);
    if (this.historyPoints.length > 200) this.historyPoints.shift();
    this.trackPolyline.setLatLngs(this.historyPoints);

    // Auto-follow pan
    if (this.autoFollow) {
      this.map.panTo(latLng, { animate: true, duration: 1 });
    }

    // Update HUD counters
    this.updateHud({
      lat,
      lon,
      speed,
      sats,
      acc,
      alt,
      timestamp: loc.timestamp,
      motion: loc.motion
    });
  },

  updateHud(data) {
    const speedEl = document.getElementById('hudSpeed');
    const coordsEl = document.getElementById('hudCoords');
    const satsEl = document.getElementById('hudSats');
    const accEl = document.getElementById('hudAcc');
    const altEl = document.getElementById('hudAlt');
    const timeEl = document.getElementById('hudTime');
    const motionEl = document.getElementById('hudMotion');

    if (speedEl) speedEl.textContent = `${data.speed} km/h`;
    if (coordsEl) coordsEl.textContent = `${data.lat.toFixed(5)}, ${data.lon.toFixed(5)}`;
    if (satsEl) satsEl.textContent = `${data.sats} Fix`;
    if (accEl) accEl.textContent = `±${data.acc}m`;
    if (altEl) altEl.textContent = `${data.alt}m`;
    if (timeEl && data.timestamp) {
      timeEl.textContent = new Date(data.timestamp).toLocaleTimeString([], { hour12: false });
    }
    if (motionEl) {
      motionEl.textContent = data.motion || 'NORMAL';
      motionEl.style.color = data.motion === 'POSSIBLE_IMPACT' ? 'var(--accent-rose)' : 'var(--accent-emerald)';
    }
  },

  bindControls() {
    // Auto-center toggle
    const followBtn = document.getElementById('btnToggleFollow');
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        this.autoFollow = !this.autoFollow;
        followBtn.classList.toggle('active', this.autoFollow);
        followBtn.style.color = this.autoFollow ? 'var(--accent-cyan)' : 'var(--text-dim)';
        App.showToast(this.autoFollow ? 'Auto-follow enabled' : 'Free map navigation mode', 'info');
      });
    }

    // Geofence toggle
    const gfBtn = document.getElementById('btnToggleGeofence');
    if (gfBtn) {
      gfBtn.addEventListener('click', () => {
        this.showGeofence = !this.showGeofence;
        if (this.geofenceCircle) {
          if (this.showGeofence) this.map.addLayer(this.geofenceCircle);
          else this.map.removeLayer(this.geofenceCircle);
        }
        gfBtn.style.color = this.showGeofence ? 'var(--accent-emerald)' : 'var(--text-dim)';
      });
    }

    // Fit route bounds
    const fitBtn = document.getElementById('btnFitBounds');
    if (fitBtn) {
      fitBtn.addEventListener('click', () => {
        if (this.historyPoints.length > 0) {
          this.map.fitBounds(this.trackPolyline.getBounds(), { padding: [50, 50] });
        } else {
          this.map.setView(this.marker.getLatLng(), 16);
        }
      });
    }

    // Clear trail
    const clearBtn = document.getElementById('btnClearTrail');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.historyPoints = [];
        this.trackPolyline.setLatLngs([]);
        App.showToast('Trail polyline cleared from display', 'info');
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  TrackingController.init();
});

window.TrackingController = TrackingController;

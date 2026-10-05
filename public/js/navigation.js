/**
 * TRACKX Navigation & Route Pathfinder Controller
 * Calculates distance, ETA, and turn-by-turn route from tracker to destination.
 */
const NavigationController = {
  map: null,
  currentMarker: null,
  destMarker: null,
  routePolyline: null,
  currentPos: { lat: 21.1458, lon: 79.0882 },
  destPos: null,

  // Preset destinations around sample campus/city
  presets: [
    { name: "Emergency Hospital & Trauma Center", lat: 21.1550, lon: 79.1020, icon: "🏥" },
    { name: "Central Police Station Command", lat: 21.1580, lon: 79.0840, icon: "🚓" },
    { name: "City Fire & Rescue Brigade", lat: 21.1390, lon: 79.0910, icon: "🚒" },
    { name: "Metro Transit Central Hub", lat: 21.1490, lon: 79.0970, icon: "🚇" }
  ],

  async init() {
    this.initMap();
    await this.fetchCurrentLocation();
    this.bindEvents();
    this.renderPresets();

    // Re-query current location every 5 seconds
    setInterval(() => this.fetchCurrentLocation(false), 5000);
  },

  initMap() {
    this.map = L.map('navMap', {
      zoomControl: false,
      attributionControl: false
    }).setView([this.currentPos.lat, this.currentPos.lon], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Current Tracker Marker
    const trackerIcon = L.divIcon({
      className: 'custom-tracker-icon',
      html: `
        <div style="background: #2563eb; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #fff; box-shadow: 0 0 12px rgba(37,99,235,0.7); font-size: 16px;">
          🛰️
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.currentMarker = L.marker([this.currentPos.lat, this.currentPos.lon], { icon: trackerIcon }).addTo(this.map);
    this.currentMarker.bindPopup('<b>Current Tracker Location</b>');

    // Click map to set destination
    this.map.on('click', (e) => {
      this.setDestination(e.latlng.lat, e.latlng.lng, `Destination (${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)})`);
    });
  },

  bindEvents() {
    // Custom Lat/Lon input form
    const form = document.getElementById('navCoordsForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const latInput = parseFloat(document.getElementById('inputDestLat').value);
        const lonInput = parseFloat(document.getElementById('inputDestLon').value);
        if (!isNaN(latInput) && !isNaN(lonInput)) {
          this.setDestination(latInput, lonInput, 'Target Coordinates');
        } else {
          alert('Please enter valid decimal coordinates');
        }
      });
    }

    // Clear route
    const clearBtn = document.getElementById('btnClearNav');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearRoute());
    }
  },

  renderPresets() {
    const container = document.getElementById('navPresetsContainer');
    if (!container) return;

    container.innerHTML = this.presets.map(p => `
      <div class="preset-card" onclick="NavigationController.setDestination(${p.lat}, ${p.lon}, '${p.name}')" style="background: var(--bg-card); border: 1px solid var(--border-subtle); padding: 10px 14px; border-radius: var(--radius-md); cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px;">${p.icon}</span>
          <div>
            <div style="font-weight: 600; font-size: 13px; color: #fff;">${p.name}</div>
            <div style="font-size: 11px; color: var(--text-dim);">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</div>
          </div>
        </div>
        <span style="font-size: 12px; color: var(--accent-cyan);">Route →</span>
      </div>
    `).join('');
  },

  async fetchCurrentLocation(recenter = true) {
    try {
      const res = await API.get('/api/location/latest', { deviceId: API.getActiveDeviceId() });
      if (res.success && res.data) {
        this.currentPos = {
          lat: parseFloat(res.data.latitude),
          lon: parseFloat(res.data.longitude)
        };
        this.currentMarker.setLatLng([this.currentPos.lat, this.currentPos.lon]);

        const startEl = document.getElementById('navOriginCoords');
        if (startEl) {
          startEl.textContent = `${this.currentPos.lat.toFixed(5)}, ${this.currentPos.lon.toFixed(5)}`;
        }

        if (this.destPos) {
          this.calculateRoute();
        } else if (recenter) {
          this.map.setView([this.currentPos.lat, this.currentPos.lon], 14);
        }
      }
    } catch (e) {
      console.warn('Current location fetch error:', e);
    }
  },

  setDestination(lat, lon, label = 'Destination') {
    this.destPos = { lat, lon, label };

    // Update input fields
    const latInp = document.getElementById('inputDestLat');
    const lonInp = document.getElementById('inputDestLon');
    if (latInp) latInp.value = lat.toFixed(5);
    if (lonInp) lonInp.value = lon.toFixed(5);

    // Destination Pin Marker
    if (this.destMarker) this.map.removeLayer(this.destMarker);

    const destIcon = L.divIcon({
      className: 'dest-pin-icon',
      html: `
        <div style="background: #ef4444; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2.5px solid #fff; box-shadow: 0 0 12px rgba(239,68,68,0.7); font-size: 16px;">
          🎯
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.destMarker = L.marker([lat, lon], { icon: destIcon }).addTo(this.map);
    this.destMarker.bindPopup(`<b>${label}</b><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();

    const destEl = document.getElementById('navDestCoords');
    if (destEl) destEl.textContent = label;

    this.calculateRoute();
  },

  async calculateRoute() {
    if (!this.currentPos || !this.destPos) return;

    const startLat = this.currentPos.lat;
    const startLon = this.currentPos.lon;
    const destLat = this.destPos.lat;
    const destLon = this.destPos.lon;

    const infoPanel = document.getElementById('navMetrics');
    if (infoPanel) infoPanel.style.display = 'block';

    const stepsList = document.getElementById('navStepsList');
    if (stepsList) stepsList.innerHTML = '<div style="color: var(--text-dim); padding: 8px;">Calculating optimal route...</div>';

    // 1. Try public OSRM driving service
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson&steps=true`;
      const response = await fetch(osrmUrl);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);

        this.renderRoutePolyline(coordinates);

        const distKm = (route.distance / 1000).toFixed(2);
        const durationMins = Math.round(route.duration / 60);

        this.updateRouteMetrics(distKm, durationMins, 'OSRM Real-world Driving Route');
        this.renderTurnSteps(route.legs[0].steps);
        return;
      }
    } catch (osrmErr) {
      console.warn('OSRM routing unavailable, using geodesic fallback:', osrmErr.message);
    }

    // 2. Fallback: Direct Geodesic calculation
    const distMeters = this.map.distance([startLat, startLon], [destLat, destLon]);
    const distKm = (distMeters / 1000).toFixed(2);
    // Estimated driving time at 35 km/h city speed
    const durationMins = Math.max(1, Math.round((distKm / 35) * 60));

    const directPoints = [
      [startLat, startLon],
      [destLat, destLon]
    ];
    this.renderRoutePolyline(directPoints);
    this.updateRouteMetrics(distKm, durationMins, 'Direct Transit Vector (Bearing Route)');

    if (stepsList) {
      stepsList.innerHTML = `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 8px;">
          <span>🟢</span>
          <div><b>Start:</b> Current Tracker Position (${startLat.toFixed(4)}, ${startLon.toFixed(4)})</div>
        </div>
        <div style="padding: 10px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 8px;">
          <span>🧭</span>
          <div>Proceed towards ${this.destPos.label} • Distance: ${distKm} km</div>
        </div>
        <div style="padding: 10px; display: flex; gap: 8px;">
          <span>🎯</span>
          <div><b>Destination:</b> Reach target perimeter in ~${durationMins} mins</div>
        </div>
      `;
    }
  },

  renderRoutePolyline(latLngs) {
    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
    }

    this.routePolyline = L.polyline(latLngs, {
      color: '#38bdf8',
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: null
    }).addTo(this.map);

    this.map.fitBounds(this.routePolyline.getBounds(), { padding: [60, 60] });
  },

  updateRouteMetrics(distanceKm, durationMinutes, provider) {
    const distEl = document.getElementById('navDistanceVal');
    const etaEl = document.getElementById('navEtaVal');
    const provEl = document.getElementById('navProviderVal');

    if (distEl) distEl.textContent = `${distanceKm} km`;
    if (etaEl) etaEl.textContent = `${durationMinutes} mins`;
    if (provEl) provEl.textContent = provider;
  },

  renderTurnSteps(steps) {
    const stepsList = document.getElementById('navStepsList');
    if (!stepsList || !steps) return;

    stepsList.innerHTML = steps.map((step, idx) => {
      const modifier = step.maneuver.modifier || '';
      let icon = '⬆️';
      if (modifier.includes('right')) icon = '↗️';
      else if (modifier.includes('left')) icon = '↖️';
      else if (step.maneuver.type === 'arrive') icon = '🎯';

      const instruction = step.maneuver.instruction || (step.name ? `Proceed onto ${step.name}` : 'Continue on route');
      const dist = step.distance > 0 ? `${Math.round(step.distance)}m` : '';

      return `
        <div style="padding: 10px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between; font-size: 13px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px;">${icon}</span>
            <div>${instruction}</div>
          </div>
          <span style="color: var(--text-dim); font-size: 11px; font-family: var(--font-mono);">${dist}</span>
        </div>
      `;
    }).join('');
  },

  clearRoute() {
    if (this.routePolyline) this.map.removeLayer(this.routePolyline);
    if (this.destMarker) this.map.removeLayer(this.destMarker);
    this.destPos = null;

    const infoPanel = document.getElementById('navMetrics');
    if (infoPanel) infoPanel.style.display = 'none';

    const stepsList = document.getElementById('navStepsList');
    if (stepsList) stepsList.innerHTML = '<div style="color: var(--text-dim); padding: 8px;">Select a destination or click the map to view directions.</div>';

    this.map.setView([this.currentPos.lat, this.currentPos.lon], 14);
    App.showToast('Navigation route cleared', 'info');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  NavigationController.init();
});

window.NavigationController = NavigationController;

/**
 * TRACKX Geofence Management Controller
 * Interactive boundary creation, radius tuning, active status toggles, and breach monitors.
 */
const GeofenceController = {
  map: null,
  trackerMarker: null,
  previewCircle: null,
  activeCircles: new Map(), // id -> L.circle
  editingId: null,

  init() {
    this.initMap();
    this.loadGeofences();
    this.bindFormEvents();
    this.loadTrackerPosition();

    // Check tracker distance to zones every 4 seconds
    setInterval(() => this.loadTrackerPosition(), 4000);
  },

  initMap() {
    this.map = L.map('geofenceMap', {
      zoomControl: false,
      attributionControl: false
    }).setView([21.1458, 79.0882], 15);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Click map to set new geofence center
    this.map.on('click', (e) => {
      this.setFormCoordinates(e.latlng.lat, e.latlng.lng);
    });
  },

  setFormCoordinates(lat, lon) {
    const latInp = document.getElementById('gfLat');
    const lonInp = document.getElementById('gfLon');
    if (latInp) latInp.value = lat.toFixed(5);
    if (lonInp) lonInp.value = lon.toFixed(5);

    this.updatePreviewCircle();
  },

  updatePreviewCircle() {
    const lat = parseFloat(document.getElementById('gfLat').value);
    const lon = parseFloat(document.getElementById('gfLon').value);
    const rad = parseFloat(document.getElementById('gfRadius').value) || 500;
    const radDisplay = document.getElementById('radiusDisplayVal');
    if (radDisplay) radDisplay.textContent = `${rad} meters`;

    if (isNaN(lat) || isNaN(lon)) return;

    if (!this.previewCircle) {
      this.previewCircle = L.circle([lat, lon], {
        radius: rad,
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.15,
        weight: 2,
        dashArray: '5, 5'
      }).addTo(this.map);
    } else {
      this.previewCircle.setLatLng([lat, lon]);
      this.previewCircle.setRadius(rad);
    }
  },

  async loadTrackerPosition() {
    try {
      const res = await API.get('/api/location/latest', { deviceId: API.getActiveDeviceId() });
      if (res.success && res.data) {
        const lat = parseFloat(res.data.latitude);
        const lon = parseFloat(res.data.longitude);

        if (!this.trackerMarker) {
          this.trackerMarker = L.marker([lat, lon], {
            icon: L.divIcon({
              className: 'tracker-gf-icon',
              html: '<div style="background: #2563eb; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid #fff; box-shadow: 0 0 10px #38bdf8;">🛰️</div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            })
          }).addTo(this.map);
          this.trackerMarker.bindPopup('<b>Current Tracker Position</b>');
        } else {
          this.trackerMarker.setLatLng([lat, lon]);
        }
      }

      // Also refresh inside/outside breach calculations
      this.refreshCurrentGeofenceStatus();
    } catch (e) {
      console.warn('Tracker position load error in geofence:', e);
    }
  },

  async refreshCurrentGeofenceStatus() {
    try {
      const res = await API.get('/api/geofence/status/current', { deviceId: API.getActiveDeviceId() });
      if (res.success && res.geofences) {
        res.geofences.forEach(gf => {
          const pill = document.getElementById(`gfStatusPill_${gf.geofenceId}`);
          if (pill) {
            const isInside = gf.status === 'INSIDE';
            pill.className = `badge ${isInside ? 'badge-success' : 'badge-critical'}`;
            pill.textContent = isInside ? `INSIDE (${gf.distanceMeters}m)` : `OUTSIDE (${gf.distanceMeters}m)`;
          }
        });
      }
    } catch (e) {
      console.warn('Status refresh error:', e);
    }
  },

  async loadGeofences() {
    try {
      const res = await API.get('/api/geofence');
      if (res.success) {
        this.renderGeofenceList(res.data);
        this.renderMapCircles(res.data);
      }
    } catch (e) {
      console.error('Error loading geofences:', e);
    }
  },

  renderMapCircles(geofences) {
    // Clear old circles
    this.activeCircles.forEach(c => this.map.removeLayer(c));
    this.activeCircles.clear();

    geofences.forEach(gf => {
      const circle = L.circle([gf.latitude, gf.longitude], {
        radius: gf.radius,
        color: gf.color || '#10b981',
        fillColor: gf.color || '#10b981',
        fillOpacity: gf.active ? 0.15 : 0.04,
        weight: gf.active ? 2 : 1,
        dashArray: gf.active ? null : '4, 4'
      }).addTo(this.map);

      circle.bindTooltip(`<b>${gf.name}</b><br>Radius: ${gf.radius}m • ${gf.active ? 'ACTIVE' : 'INACTIVE'}`, {
        permanent: false,
        direction: 'top'
      });

      this.activeCircles.set(gf.id, circle);
    });
  },

  renderGeofenceList(geofences) {
    const listEl = document.getElementById('geofenceListContainer');
    if (!listEl) return;

    if (!geofences || geofences.length === 0) {
      listEl.innerHTML = `<div style="color: var(--text-dim); text-align: center; padding: 20px;">No safe zones defined yet. Click map to place a perimeter.</div>`;
      return;
    }

    listEl.innerHTML = geofences.map(gf => `
      <div class="card-panel" style="margin-bottom: 12px; padding: 14px; border-left: 4px solid ${gf.color || '#10b981'};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div>
            <b style="font-size: 14px; color: #fff;">${gf.name}</b>
            <span style="font-size: 11px; color: var(--text-dim); margin-left: 6px;">(${gf.radius}m radius)</span>
          </div>
          <span id="gfStatusPill_${gf.id}" class="badge ${gf.active ? 'badge-success' : 'badge-info'}">
            ${gf.active ? 'Active Safe Zone' : 'Inactive'}
          </span>
        </div>

        <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
          Center: ${gf.latitude.toFixed(4)}, ${gf.longitude.toFixed(4)}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="GeofenceController.toggleActive(${gf.id}, ${gf.active ? 0 : 1})">
              ${gf.active ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="GeofenceController.zoomTo(${gf.id}, ${gf.latitude}, ${gf.longitude})">
              🔍 Focus
            </button>
          </div>
          <button class="btn btn-danger" style="font-size: 11px; padding: 4px 10px;" onclick="GeofenceController.deleteZone(${gf.id})">
            🗑️ Delete
          </button>
        </div>
      </div>
    `).join('');
  },

  bindFormEvents() {
    // Radius slider live update
    const radSlider = document.getElementById('gfRadius');
    if (radSlider) {
      radSlider.addEventListener('input', () => this.updatePreviewCircle());
    }

    // Input coordinate triggers
    const latInp = document.getElementById('gfLat');
    const lonInp = document.getElementById('gfLon');
    if (latInp) latInp.addEventListener('input', () => this.updatePreviewCircle());
    if (lonInp) lonInp.addEventListener('input', () => this.updatePreviewCircle());

    // Form submit
    const form = document.getElementById('geofenceForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('gfName').value;
        const latitude = parseFloat(document.getElementById('gfLat').value);
        const longitude = parseFloat(document.getElementById('gfLon').value);
        const radius = parseFloat(document.getElementById('gfRadius').value);
        const color = document.getElementById('gfColor').value;

        try {
          const res = await API.post('/api/geofence', {
            name,
            latitude,
            longitude,
            radius,
            color,
            active: 1
          });

          if (res.success) {
            App.showToast(`Safe zone "${name}" created successfully!`, 'info');
            if (this.previewCircle) {
              this.map.removeLayer(this.previewCircle);
              this.previewCircle = null;
            }
            form.reset();
            document.getElementById('gfRadius').value = 500;
            document.getElementById('radiusDisplayVal').textContent = '500 meters';
            this.loadGeofences();
          }
        } catch (err) {
          alert(err.message);
        }
      });
    }
  },

  zoomTo(id, lat, lon) {
    this.map.setView([lat, lon], 16);
    const circle = this.activeCircles.get(id);
    if (circle) circle.openTooltip();
  },

  async toggleActive(id, newActive) {
    try {
      await API.put(`/api/geofence/${id}`, { active: newActive });
      App.showToast(`Geofence #${id} ${newActive ? 'activated' : 'deactivated'}`, 'info');
      this.loadGeofences();
    } catch (e) {
      alert(e.message);
    }
  },

  async deleteZone(id) {
    if (!confirm(`Delete Safe Zone #${id}?`)) return;
    try {
      await API.delete(`/api/geofence/${id}`);
      App.showToast(`Geofence #${id} deleted`, 'info');
      this.loadGeofences();
    } catch (e) {
      alert(e.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  GeofenceController.init();
});

window.GeofenceController = GeofenceController;

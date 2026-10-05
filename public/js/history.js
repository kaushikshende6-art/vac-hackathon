/**
 * TRACKX Trip History & Route Playback Controller
 * Renders trip tables, historical route polylines, and playback animations.
 */
const HistoryController = {
  map: null,
  routePolyline: null,
  startMarker: null,
  endMarker: null,
  playbackMarker: null,
  alertMarkers: [],
  currentTripPoints: [],
  playbackIndex: 0,
  playbackInterval: null,
  isPlaying: false,

  async init() {
    this.initMap();
    await this.loadTrips();
    this.bindTripControls();
  },

  initMap() {
    this.map = L.map('historyMap', {
      zoomControl: false,
      attributionControl: false
    }).setView([21.1458, 79.0882], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    L.control.zoom({ position: 'topright' }).addTo(this.map);
  },

  async loadTrips() {
    try {
      const deviceId = API.getActiveDeviceId();
      const res = await API.get('/api/trips', { deviceId });
      if (res.success) {
        this.renderTripsTable(res.data);

        // Auto-select first trip if available
        if (res.data.length > 0) {
          this.viewTrip(res.data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load trips:', e);
    }
  },

  renderTripsTable(trips) {
    const tbody = document.getElementById('tripsTableBody');
    if (!tbody) return;

    if (!trips || trips.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 24px;">No historical trips found. Start a trip using the controls above.</td></tr>`;
      return;
    }

    tbody.innerHTML = trips.map(t => {
      const startDate = new Date(t.start_time);
      const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const startStr = startDate.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
      const endStr = t.end_time ? new Date(t.end_time).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }) : 'Active';

      const durationMins = Math.round((t.duration || 0) / 60);

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: #fff;">${t.title || 'Trip #' + t.id}</div>
            <div style="font-size: 11px; color: var(--text-dim);">${dateStr}</div>
          </td>
          <td style="font-family: var(--font-mono); font-size: 12px;">${startStr} → ${endStr}</td>
          <td style="font-weight: 600; color: var(--accent-cyan);">${t.distance} km</td>
          <td>${durationMins}m (${t.duration || 0}s)</td>
          <td>${t.average_speed} km/h</td>
          <td>${t.max_speed} km/h</td>
          <td>
            ${t.alert_count > 0 ? 
              `<span class="badge badge-warning">${t.alert_count} Alerts</span>` : 
              '<span style="color: var(--text-dim);">0</span>'
            }
          </td>
          <td>
            <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="HistoryController.viewTrip(${t.id})">
              🗺️ View Route
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async viewTrip(tripId) {
    this.stopPlayback();

    try {
      const res = await API.get(`/api/trips/${tripId}`);
      if (!res.success || !res.data) {
        alert('Could not fetch trip details');
        return;
      }

      const trip = res.data;
      this.currentTripPoints = trip.points || [];

      // Display trip summary card
      const summaryCard = document.getElementById('selectedTripSummary');
      if (summaryCard) {
        summaryCard.style.display = 'block';
        document.getElementById('tripTitleDisplay').textContent = trip.title || `Trip #${trip.id}`;
        document.getElementById('tripDistDisplay').textContent = `${trip.distance} km`;
        document.getElementById('tripDurationDisplay').textContent = `${Math.round((trip.duration || 0) / 60)} mins`;
        document.getElementById('tripAvgSpeedDisplay').textContent = `${trip.average_speed} km/h`;
        document.getElementById('tripMaxSpeedDisplay').textContent = `${trip.max_speed} km/h`;
      }

      // Clear previous layers
      if (this.routePolyline) this.map.removeLayer(this.routePolyline);
      if (this.startMarker) this.map.removeLayer(this.startMarker);
      if (this.endMarker) this.map.removeLayer(this.endMarker);
      if (this.playbackMarker) this.map.removeLayer(this.playbackMarker);
      this.alertMarkers.forEach(m => this.map.removeLayer(m));
      this.alertMarkers = [];

      if (this.currentTripPoints.length === 0) {
        App.showToast('No GPS points recorded during this trip time frame', 'warning');
        return;
      }

      const latLngs = this.currentTripPoints.map(p => [p.latitude, p.longitude]);

      // Draw historical track line with gradient styling
      this.routePolyline = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      // Start Marker (Green Flag)
      const startPt = latLngs[0];
      this.startMarker = L.marker(startPt, {
        icon: L.divIcon({
          className: 'start-trip-icon',
          html: '<div style="background: #10b981; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid #fff; box-shadow: 0 0 10px rgba(16,185,129,0.7);">🚩</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(this.map);
      this.startMarker.bindPopup(`<b>Trip Start Point</b><br>${new Date(trip.start_time).toLocaleTimeString()}`);

      // End Marker (Red Flag)
      const endPt = latLngs[latLngs.length - 1];
      this.endMarker = L.marker(endPt, {
        icon: L.divIcon({
          className: 'end-trip-icon',
          html: '<div style="background: #ef4444; color: #fff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid #fff; box-shadow: 0 0 10px rgba(239,68,68,0.7);">🏁</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
      }).addTo(this.map);
      this.endMarker.bindPopup(`<b>Trip Destination / End Point</b><br>${trip.end_time ? new Date(trip.end_time).toLocaleTimeString() : 'Active'}`);

      // Alert markers along route
      if (trip.alerts && trip.alerts.length > 0) {
        trip.alerts.forEach(a => {
          if (a.latitude && a.longitude) {
            const m = L.marker([a.latitude, a.longitude], {
              icon: L.divIcon({
                className: 'alert-route-icon',
                html: '<div style="background: #f59e0b; color: #000; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 2px solid #fff;">⚠️</div>',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }).addTo(this.map);
            m.bindPopup(`<b>${a.type} Alert:</b><br>${a.message}<br><small>${new Date(a.timestamp).toLocaleTimeString()}</small>`);
            this.alertMarkers.push(m);
          }
        });
      }

      // Fit bounds to polyline
      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [60, 60] });

      // Init Playback Marker
      this.playbackMarker = L.marker(startPt, {
        icon: L.divIcon({
          className: 'playback-sim-icon',
          html: '<div style="background: #2563eb; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2.5px solid #fff; box-shadow: 0 0 15px #38bdf8;">🛰️</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).addTo(this.map);

      // Reset playback controls
      this.playbackIndex = 0;
      const slider = document.getElementById('playbackSlider');
      if (slider) {
        slider.max = this.currentTripPoints.length - 1;
        slider.value = 0;
      }

    } catch (e) {
      console.error('Error viewing trip:', e);
    }
  },

  bindTripControls() {
    // Playback play/pause
    const playBtn = document.getElementById('btnPlayTrip');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (this.isPlaying) this.pausePlayback();
        else this.startPlayback();
      });
    }

    // Playback slider scrubbing
    const slider = document.getElementById('playbackSlider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.playbackIndex = parseInt(e.target.value, 10);
        this.updatePlaybackPosition();
      });
    }

    // Start New Trip button
    const startTripBtn = document.getElementById('btnStartTrip');
    if (startTripBtn) {
      startTripBtn.addEventListener('click', async () => {
        const title = prompt('Enter a title for this trip (e.g. Afternoon Campus Delivery):');
        if (title === null) return;
        try {
          const res = await API.post('/api/trips/start', {
            deviceId: API.getActiveDeviceId(),
            title: title || undefined
          });
          if (res.success) {
            App.showToast('Active trip recording started!', 'info');
            this.loadTrips();
          }
        } catch (e) {
          alert(e.message);
        }
      });
    }

    // Stop Trip button
    const stopTripBtn = document.getElementById('btnStopTrip');
    if (stopTripBtn) {
      stopTripBtn.addEventListener('click', async () => {
        try {
          const res = await API.post('/api/trips/stop', {
            deviceId: API.getActiveDeviceId()
          });
          if (res.success) {
            App.showToast(`Trip recorded: ${res.data.distance} km completed`, 'info');
            this.loadTrips();
          }
        } catch (e) {
          alert(e.message);
        }
      });
    }
  },

  startPlayback() {
    if (!this.currentTripPoints || this.currentTripPoints.length === 0) return;
    this.isPlaying = true;
    const playBtn = document.getElementById('btnPlayTrip');
    if (playBtn) playBtn.textContent = '⏸️ Pause';

    this.playbackInterval = setInterval(() => {
      this.playbackIndex++;
      if (this.playbackIndex >= this.currentTripPoints.length) {
        this.playbackIndex = 0;
      }
      this.updatePlaybackPosition();
    }, 600);
  },

  pausePlayback() {
    this.isPlaying = false;
    clearInterval(this.playbackInterval);
    const playBtn = document.getElementById('btnPlayTrip');
    if (playBtn) playBtn.textContent = '▶️ Play Route';
  },

  stopPlayback() {
    this.pausePlayback();
    this.playbackIndex = 0;
  },

  updatePlaybackPosition() {
    if (!this.playbackMarker || !this.currentTripPoints[this.playbackIndex]) return;

    const pt = this.currentTripPoints[this.playbackIndex];
    this.playbackMarker.setLatLng([pt.latitude, pt.longitude]);

    const slider = document.getElementById('playbackSlider');
    if (slider) slider.value = this.playbackIndex;

    const timeLabel = document.getElementById('playbackTimeLabel');
    if (timeLabel) {
      timeLabel.textContent = `${new Date(pt.timestamp).toLocaleTimeString()} • ${Math.round(pt.speed || 0)} km/h`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  HistoryController.init();
});

window.HistoryController = HistoryController;

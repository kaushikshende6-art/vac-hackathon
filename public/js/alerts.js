/**
 * TRACKX Safety & Alert Center Controller
 * Manages alert feeds, filter criteria, acknowledgment workflows, and sirens.
 */
const AlertsController = {
  currentFilter: 'ALL',
  unackOnly: false,
  pollTimer: null,

  init() {
    this.bindEvents();
    this.loadAlerts();
    this.pollTimer = setInterval(() => this.loadAlerts(), 3000);
  },

  bindEvents() {
    // Filter pills
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter || 'ALL';
        this.loadAlerts();
      });
    });

    // Unack only checkbox
    const unackCheckbox = document.getElementById('chkUnackOnly');
    if (unackCheckbox) {
      unackCheckbox.addEventListener('change', (e) => {
        this.unackOnly = e.target.checked;
        this.loadAlerts();
      });
    }

    // Acknowledge All button
    const ackAllBtn = document.getElementById('btnAckAllAlerts');
    if (ackAllBtn) {
      ackAllBtn.addEventListener('click', () => this.acknowledgeAll());
    }

    // Manual SOS trigger form/button
    const manualSosBtn = document.getElementById('btnTriggerManualSos');
    if (manualSosBtn) {
      manualSosBtn.addEventListener('click', () => {
        const msg = prompt('Enter custom emergency alert message:', 'Manual Emergency Trigger from Dispatch Console');
        if (msg) this.triggerCustomAlert('SOS', 'critical', msg);
      });
    }
  },

  async loadAlerts() {
    try {
      const deviceId = API.getActiveDeviceId();
      const params = { deviceId, limit: 100 };

      if (this.currentFilter !== 'ALL') {
        params.type = this.currentFilter;
      }
      if (this.unackOnly) {
        params.unacknowledgedOnly = true;
      }

      const res = await API.get('/api/alerts', params);
      if (res.success) {
        this.renderAlertsTable(res.data);
      }
    } catch (e) {
      console.error('Error loading alerts:', e);
    }
  },

  renderAlertsTable(alerts) {
    const tbody = document.getElementById('alertsMasterTableBody');
    if (!tbody) return;

    if (!alerts || alerts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 30px;">No alerts matching the selected filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = alerts.map(a => {
      let badgeClass = 'badge-info';
      if (a.type === 'SOS' || a.severity === 'critical') badgeClass = 'badge-critical';
      else if (a.type === 'GEOFENCE' || a.severity === 'warning') badgeClass = 'badge-warning';

      const time = new Date(a.timestamp);
      const timeStr = time.toLocaleTimeString([], { hour12: false });
      const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const coordsStr = (a.latitude && a.longitude) ? 
        `<a href="/tracking?lat=${a.latitude}&lon=${a.longitude}" style="color: var(--accent-cyan); text-decoration: underline;" title="View on map">${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}</a>` : 
        '<span style="color: var(--text-dim);">No Fix</span>';

      return `
        <tr style="${a.type === 'SOS' && !a.acknowledged ? 'background: rgba(239,68,68,0.08);' : ''}">
          <td><span class="badge ${badgeClass}">${a.type}</span></td>
          <td style="font-family: var(--font-mono); font-size: 12px; font-weight: 600;">${a.device_id}</td>
          <td style="font-weight: 500; color: #fff;">${a.message}</td>
          <td style="font-family: var(--font-mono); font-size: 12px;">${coordsStr}</td>
          <td style="color: var(--text-dim); font-size: 12px;">${dateStr} ${timeStr}</td>
          <td>
            ${a.acknowledged ? 
              '<span class="badge badge-success">Acknowledged</span>' : 
              '<span class="badge badge-critical" style="animation: pulse 2s infinite;">Active</span>'
            }
          </td>
          <td>
            ${!a.acknowledged ? 
              `<button class="btn btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="AlertsController.ackSingle(${a.id})">✓ Acknowledge</button>` : 
              '<span style="color: var(--text-dim); font-size: 12px;">Resolved</span>'
            }
          </td>
        </tr>
      `;
    }).join('');
  },

  async ackSingle(id) {
    try {
      await API.patch(`/api/alerts/${id}/ack`);
      App.showToast(`Alert #${id} marked as acknowledged`, 'info');
      this.loadAlerts();
    } catch (e) {
      alert(e.message);
    }
  },

  async acknowledgeAll() {
    try {
      const res = await API.post('/api/alerts/ack-all', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        App.showToast(`All ${res.acknowledgedCount || 0} active alerts cleared!`, 'info');
        this.loadAlerts();
      }
    } catch (e) {
      alert(e.message);
    }
  },

  async triggerCustomAlert(type, severity, message) {
    try {
      const res = await API.post('/api/alerts', {
        deviceId: API.getActiveDeviceId(),
        type,
        severity,
        message
      });
      if (res.success) {
        App.showToast(`New ${type} alert created`, 'critical');
        this.loadAlerts();
      }
    } catch (e) {
      alert(e.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AlertsController.init();
});

window.AlertsController = AlertsController;

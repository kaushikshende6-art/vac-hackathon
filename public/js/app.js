/**
 * TRACKX Global Application Shell Controller
 * Runs on every page for topbar status, alert notifications, and navigation.
 */
const App = {
  statusInterval: null,
  activeDeviceId: 'TRACKX-01',
  audioAlertEnabled: true,
  lastCriticalAlertId: null,

  init() {
    this.activeDeviceId = API.getActiveDeviceId();
    this.bindEvents();
    this.startClock();
    this.pollStatus();

    // Set polling interval: 3 seconds
    this.statusInterval = setInterval(() => this.pollStatus(), 3000);
  },

  bindEvents() {
    // Mobile navigation toggle
    const menuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
      // Close sidebar when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !menuBtn.contains(e.target) && sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
        }
      });
    }

    // Device selector change
    const deviceSelect = document.getElementById('topbarDeviceSelect');
    if (deviceSelect) {
      deviceSelect.value = this.activeDeviceId;
      deviceSelect.addEventListener('change', (e) => {
        this.activeDeviceId = e.target.value;
        API.setActiveDeviceId(this.activeDeviceId);
        window.location.reload();
      });
    }

    // Emergency SOS button in topbar
    const sosBtn = document.getElementById('headerSosBtn');
    if (sosBtn) {
      sosBtn.addEventListener('click', () => this.triggerSos());
    }

    // Audio alarm toggle
    const audioToggleBtn = document.getElementById('audioToggleBtn');
    if (audioToggleBtn) {
      audioToggleBtn.addEventListener('click', () => {
        this.audioAlertEnabled = !this.audioAlertEnabled;
        audioToggleBtn.textContent = this.audioAlertEnabled ? '🔊 Audio Alert: ON' : '🔇 Audio Alert: MUTED';
        this.showToast(this.audioAlertEnabled ? 'Alert sirens enabled' : 'Alert sirens muted', 'info');
      });
    }
  },

  startClock() {
    const clockEl = document.getElementById('topbarClock');
    if (!clockEl) return;
    const updateTime = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  async pollStatus() {
    try {
      // 1. Fetch device status
      const devRes = await API.get('/api/device/status', { deviceId: this.activeDeviceId });
      if (devRes.success && devRes.data) {
        this.updateDeviceStatusUi(devRes.data);
      }

      // 2. Fetch alert summary
      const alertRes = await API.get('/api/alerts/summary');
      if (alertRes.success && alertRes.data) {
        this.updateAlertSummaryUi(alertRes.data);
      }
    } catch (err) {
      // Network/server down
      const statusPill = document.getElementById('deviceStatusPill');
      if (statusPill) {
        statusPill.className = 'status-pill offline';
        statusPill.innerHTML = '<span class="status-dot"></span> OFFLINE (NO SIGNAL)';
      }
    }
  },

  updateDeviceStatusUi(device) {
    const statusPill = document.getElementById('deviceStatusPill');
    if (statusPill) {
      if (device.isOnline) {
        statusPill.className = 'status-pill online';
        statusPill.innerHTML = `<span class="status-dot"></span> ONLINE`;
      } else {
        const timeAgoText = device.secondsSinceLastSeen ? ` (${device.secondsSinceLastSeen}s ago)` : '';
        statusPill.className = 'status-pill offline';
        statusPill.innerHTML = `<span class="status-dot"></span> OFFLINE${timeAgoText}`;
      }
    }

    // Satellites chip
    const satsChip = document.getElementById('satellitesChip');
    if (satsChip) {
      const sats = device.telemetry ? device.telemetry.satellites : 0;
      satsChip.innerHTML = `📡 <span>${sats} SATS</span>`;
    }

    // Battery chip
    const battChip = document.getElementById('batteryChip');
    if (battChip) {
      const batt = device.batteryLevel ? Math.round(device.batteryLevel) : 100;
      battChip.innerHTML = `🔋 <span>${batt}%</span>`;
    }
  },

  updateAlertSummaryUi(summary) {
    // Sidebar alert count badge
    const badgeEl = document.getElementById('sidebarAlertBadge');
    if (badgeEl) {
      if (summary.totalUnacknowledged > 0) {
        badgeEl.textContent = summary.totalUnacknowledged;
        badgeEl.style.display = 'inline-block';
        if (summary.sosUnacknowledged > 0) {
          badgeEl.className = 'nav-badge danger';
        } else {
          badgeEl.className = 'nav-badge';
          badgeEl.style.backgroundColor = 'var(--accent-amber)';
          badgeEl.style.color = '#000';
        }
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Top emergency banner
    const banner = document.getElementById('emergencyBanner');
    const bannerMsg = document.getElementById('emergencyBannerMsg');
    if (banner && bannerMsg) {
      if (summary.sosUnacknowledged > 0 && summary.latestAlert && summary.latestAlert.type === 'SOS') {
        banner.classList.add('active');
        bannerMsg.textContent = `EMERGENCY ALERT: ${summary.latestAlert.message}`;

        // Play alert tone if it's a new emergency
        if (this.lastCriticalAlertId !== summary.latestAlert.id) {
          this.lastCriticalAlertId = summary.latestAlert.id;
          if (this.audioAlertEnabled) {
            this.playEmergencyBeep();
          }
        }
      } else {
        banner.classList.remove('active');
      }
    }
  },

  async triggerSos() {
    const confirmed = confirm('⚠️ CONFIRM EMERGENCY SOS BROADCAST?\n\nThis will trigger high-priority alerts across all monitoring dashboards and log the exact GPS position.');
    if (!confirmed) return;

    try {
      const res = await API.post('/api/alerts', {
        deviceId: this.activeDeviceId,
        type: 'SOS',
        severity: 'critical',
        message: `EMERGENCY SOS: High priority assistance requested from ${this.activeDeviceId}!`
      });

      if (res.success) {
        this.showToast('🚨 EMERGENCY SOS BROADCASTED!', 'critical');
        this.playEmergencyBeep();
        this.pollStatus();
      }
    } catch (err) {
      alert(`Failed to broadcast SOS: ${err.message}`);
    }
  },

  async acknowledgeBannerAlert() {
    try {
      await API.post('/api/alerts/ack-all', { deviceId: this.activeDeviceId });
      const banner = document.getElementById('emergencyBanner');
      if (banner) banner.classList.remove('active');
      this.showToast('All alerts marked acknowledged', 'info');
      this.pollStatus();
    } catch (err) {
      alert(err.message);
    }
  },

  playEmergencyBeep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      const playTone = (freq, duration, delay) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + duration);
        }, delay);
      };

      // 3-tone siren sequence
      playTone(880, 0.2, 0);
      playTone(1100, 0.2, 220);
      playTone(880, 0.3, 440);
    } catch (e) {
      console.warn('Audio synthesis not supported or user gesture needed:', e);
    }
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      padding: 12px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      pointer-events: auto;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      background: ${type === 'critical' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#0284c7'};
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `<span>${type === 'critical' ? '🚨' : type === 'warning' ? '⚠️' : 'ℹ️'}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s ease';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

window.App = App;

/**
 * TRACKX Hackathon Demo Mode Controller
 * Provides simulation triggers to showcase system capabilities during judging.
 */
const DemoController = {
  autoPlayInterval: null,
  isAutoPlaying: false,

  init() {
    this.bindButtons();
  },

  bindButtons() {
    const stepBtn = document.getElementById('demoStepBtn');
    const breachBtn = document.getElementById('demoBreachBtn');
    const impactBtn = document.getElementById('demoImpactBtn');
    const sosBtn = document.getElementById('demoSosBtn');
    const resetBtn = document.getElementById('demoResetBtn');
    const autoPlayBtn = document.getElementById('demoAutoPlayBtn');

    if (stepBtn) stepBtn.addEventListener('click', () => this.stepForward());
    if (breachBtn) breachBtn.addEventListener('click', () => this.triggerBreach());
    if (impactBtn) impactBtn.addEventListener('click', () => this.triggerImpact());
    if (sosBtn) sosBtn.addEventListener('click', () => this.triggerSos());
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetSimulation());
    if (autoPlayBtn) autoPlayBtn.addEventListener('click', () => this.toggleAutoPlay());
  },

  async stepForward() {
    try {
      const res = await API.post('/api/demo/step', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        App.showToast(`Advanced: ${res.waypoint.name} (${res.location.speed} km/h)`, 'info');
        window.dispatchEvent(new CustomEvent('trackx:telemetry-update', { detail: res.location }));
      }
    } catch (err) {
      App.showToast(`Simulation step failed: ${err.message}`, 'warning');
    }
  },

  async triggerBreach() {
    try {
      const res = await API.post('/api/demo/breach', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        App.showToast('🚨 Geofence Breach Triggered! Device outside safe zone.', 'warning');
        window.dispatchEvent(new CustomEvent('trackx:telemetry-update', { detail: res.location }));
      }
    } catch (err) {
      App.showToast(`Breach trigger failed: ${err.message}`, 'warning');
    }
  },

  async triggerImpact() {
    try {
      const res = await API.post('/api/demo/impact', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        App.showToast('💥 Possible Impact Event Sent (MPU6050 Accel Spike)', 'critical');
        window.dispatchEvent(new CustomEvent('trackx:telemetry-update', { detail: res.location }));
      }
    } catch (err) {
      App.showToast(`Impact trigger failed: ${err.message}`, 'warning');
    }
  },

  async triggerSos() {
    try {
      const res = await API.post('/api/demo/sos', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        App.showToast('🚨 SOS Emergency Signal Sent from ESP8266 Hardware Button', 'critical');
        App.playEmergencyBeep();
      }
    } catch (err) {
      App.showToast(`SOS trigger failed: ${err.message}`, 'warning');
    }
  },

  async resetSimulation() {
    try {
      const res = await API.post('/api/demo/reset', { deviceId: API.getActiveDeviceId() });
      if (res.success) {
        this.stopAutoPlay();
        App.showToast('Simulation reset to Campus Gate safe zone center', 'info');
        window.dispatchEvent(new CustomEvent('trackx:telemetry-update', { detail: res.location }));
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      App.showToast(`Reset failed: ${err.message}`, 'warning');
    }
  },

  toggleAutoPlay() {
    if (this.isAutoPlaying) {
      this.stopAutoPlay();
    } else {
      this.startAutoPlay();
    }
  },

  startAutoPlay() {
    this.isAutoPlaying = true;
    const btn = document.getElementById('demoAutoPlayBtn');
    if (btn) {
      btn.innerHTML = '⏸️ Stop Auto-Drive';
      btn.style.borderColor = 'var(--accent-emerald)';
      btn.style.color = 'var(--accent-emerald)';
    }
    App.showToast('Auto-Drive simulation started (updating every 3s)', 'info');

    // Run first step immediately
    this.stepForward();
    this.autoPlayInterval = setInterval(() => {
      this.stepForward();
    }, 3000);
  },

  stopAutoPlay() {
    this.isAutoPlaying = false;
    clearInterval(this.autoPlayInterval);
    const btn = document.getElementById('demoAutoPlayBtn');
    if (btn) {
      btn.innerHTML = '▶️ Auto-Drive Simulation';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  DemoController.init();
});

window.DemoController = DemoController;

/**
 * TRACKX Settings & Hardware Configurator Controller
 */
const SettingsController = {
  init() {
    this.populateCurrentSettings();
    this.bindEvents();
    this.updateFirmwareSnippet();
  },

  populateCurrentSettings() {
    const apiUrlInp = document.getElementById('settingApiUrl');
    const deviceIdInp = document.getElementById('settingDeviceId');

    if (apiUrlInp) {
      apiUrlInp.value = API.getBaseUrl();
    }
    if (deviceIdInp) {
      deviceIdInp.value = API.getActiveDeviceId();
    }
  },

  bindEvents() {
    // API URL & Device form
    const form = document.getElementById('settingsForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('settingApiUrl').value.trim();
        const devId = document.getElementById('settingDeviceId').value.trim();

        if (url) API.setBaseUrl(url);
        if (devId) API.setActiveDeviceId(devId);

        App.showToast('Platform settings saved successfully!', 'info');
        this.updateFirmwareSnippet();
        setTimeout(() => window.location.reload(), 800);
      });
    }

    // Reset settings
    const resetBtn = document.getElementById('btnResetSettings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        API.setBaseUrl('');
        API.setActiveDeviceId('TRACKX-01');
        App.showToast('Settings reset to defaults', 'info');
        this.populateCurrentSettings();
        this.updateFirmwareSnippet();
        setTimeout(() => window.location.reload(), 600);
      });
    }

    // Firmware snippet generators inputs
    ['wifiSsid', 'wifiPass', 'settingApiUrl', 'settingDeviceId'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.updateFirmwareSnippet());
    });
  },

  updateFirmwareSnippet() {
    const ssid = document.getElementById('wifiSsid') ? document.getElementById('wifiSsid').value || 'YOUR_WIFI_SSID' : 'YOUR_WIFI_SSID';
    const pass = document.getElementById('wifiPass') ? document.getElementById('wifiPass').value || 'YOUR_WIFI_PASSWORD' : 'YOUR_WIFI_PASSWORD';
    const serverUrl = document.getElementById('settingApiUrl') ? document.getElementById('settingApiUrl').value || window.location.origin : window.location.origin;
    const deviceId = document.getElementById('settingDeviceId') ? document.getElementById('settingDeviceId').value || 'TRACKX-01' : 'TRACKX-01';

    const snippetEl = document.getElementById('firmwareConfigSnippet');
    if (snippetEl) {
      snippetEl.textContent = `// ==========================================
// TRACKX ESP8266 FIRMWARE CONFIGURATION
// Auto-generated for direct upload to NodeMCU
// ==========================================
const char* WIFI_SSID     = "${ssid}";
const char* WIFI_PASSWORD = "${pass}";
const char* SERVER_URL    = "${serverUrl}/api/location";
const char* SOS_URL       = "${serverUrl}/api/alerts";
const char* DEVICE_ID     = "${deviceId}";

const unsigned long TELEMETRY_INTERVAL = 3000; // ms`;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SettingsController.init();
});

window.SettingsController = SettingsController;

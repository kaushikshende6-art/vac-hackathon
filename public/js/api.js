/**
 * TRACKX Centralized API Client
 * Facilitates REST communication between frontend UI and Express backend.
 */
const API = {
  getBaseUrl() {
    return localStorage.getItem('trackx_api_url') || window.location.origin;
  },

  setBaseUrl(url) {
    if (!url) {
      localStorage.removeItem('trackx_api_url');
    } else {
      localStorage.setItem('trackx_api_url', url.replace(/\/+$/, ''));
    }
  },

  getActiveDeviceId() {
    return localStorage.getItem('trackx_active_device') || 'TRACKX-01';
  },

  setActiveDeviceId(deviceId) {
    localStorage.setItem('trackx_active_device', deviceId);
  },

  async request(endpoint, options = {}) {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}: Request failed`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, err.message);
      throw err;
    }
  },

  // HTTP Helpers
  get(endpoint, params = null) {
    let url = endpoint;
    if (params) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) query.append(key, val);
      });
      const qs = query.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body || {})
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body || {})
    });
  },

  patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body || {})
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

window.API = API;

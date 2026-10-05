const db = require('../database/database');
const { haversineDistance } = require('./locationService');
const alertService = require('./alertService');

// In-memory state tracking to prevent duplicate spam and detect transitions:
// deviceId_geofenceId -> { state: 'INSIDE' | 'OUTSIDE', lastAlertTime: timestamp }
const geofenceStateTracker = new Map();

const cooldownMs = (parseInt(process.env.GEOFENCE_ALERT_COOLDOWN, 10) || 120) * 1000;

const geofenceService = {
  /**
   * Get all geofences
   */
  getAll() {
    return db.prepare(`SELECT * FROM geofences ORDER BY created_at DESC`).all();
  },

  /**
   * Get active geofences
   */
  getActive() {
    return db.prepare(`SELECT * FROM geofences WHERE active = 1 ORDER BY created_at DESC`).all();
  },

  /**
   * Get geofence by ID
   */
  getById(id) {
    return db.prepare(`SELECT * FROM geofences WHERE id = ?`).get(id) || null;
  },

  /**
   * Create a new geofence
   */
  create({ name, latitude, longitude, radius, active = 1, color = '#10b981' }) {
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const rad = parseFloat(radius);

    if (!name || isNaN(lat) || isNaN(lon) || isNaN(rad) || rad <= 0) {
      throw new Error('Invalid geofence parameters. Name, valid coordinates, and positive radius required.');
    }

    const stmt = db.prepare(`
      INSERT INTO geofences (name, latitude, longitude, radius, active, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(name.trim(), lat, lon, rad, active ? 1 : 0, color || '#10b981');
    return this.getById(result.lastInsertRowid);
  },

  /**
   * Update geofence
   */
  update(id, fields) {
    const existing = this.getById(id);
    if (!existing) throw new Error(`Geofence #${id} not found`);

    const name = fields.name !== undefined ? fields.name.trim() : existing.name;
    const latitude = fields.latitude !== undefined ? parseFloat(fields.latitude) : existing.latitude;
    const longitude = fields.longitude !== undefined ? parseFloat(fields.longitude) : existing.longitude;
    const radius = fields.radius !== undefined ? parseFloat(fields.radius) : existing.radius;
    const active = fields.active !== undefined ? (fields.active ? 1 : 0) : existing.active;
    const color = fields.color !== undefined ? fields.color : existing.color;

    const stmt = db.prepare(`
      UPDATE geofences
      SET name = ?, latitude = ?, longitude = ?, radius = ?, active = ?, color = ?
      WHERE id = ?
    `);

    stmt.run(name, latitude, longitude, radius, active, color, id);
    return this.getById(id);
  },

  /**
   * Delete geofence
   */
  delete(id) {
    const stmt = db.prepare(`DELETE FROM geofences WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  },

  /**
   * Check all active geofences against current coordinates.
   * Creates alerts on boundary breaches with cooldown.
   */
  checkBreaches(deviceId, latitude, longitude) {
    const activeGeofences = this.getActive();
    const results = [];
    const now = Date.now();

    for (const gf of activeGeofences) {
      const distance = haversineDistance(latitude, longitude, gf.latitude, gf.longitude);
      const isOutside = distance > gf.radius;
      const stateKey = `${deviceId}_${gf.id}`;
      const prevState = geofenceStateTracker.get(stateKey) || { state: 'UNKNOWN', lastAlertTime: 0 };

      let alertTriggered = null;

      if (isOutside) {
        // Device is outside safe zone
        const timeSinceLastAlert = now - prevState.lastAlertTime;
        const enteredOutside = prevState.state !== 'OUTSIDE';
        const cooldownExpired = timeSinceLastAlert > cooldownMs;

        if (enteredOutside || cooldownExpired) {
          const message = `Geofence Breach: Device ${deviceId} exited safe zone "${gf.name}"! Current distance: ${Math.round(distance)}m (Safe radius: ${Math.round(gf.radius)}m).`;
          
          alertTriggered = alertService.createAlert({
            deviceId,
            type: 'GEOFENCE',
            severity: 'warning',
            message,
            latitude,
            longitude
          });

          geofenceStateTracker.set(stateKey, {
            state: 'OUTSIDE',
            lastAlertTime: now
          });
        }
      } else {
        // Inside safe zone
        if (prevState.state === 'OUTSIDE') {
          // Re-entered safe zone
          alertService.createAlert({
            deviceId,
            type: 'GEOFENCE',
            severity: 'info',
            message: `Geofence Safe: Device ${deviceId} re-entered safe zone "${gf.name}".`,
            latitude,
            longitude
          });
        }

        geofenceStateTracker.set(stateKey, {
          state: 'INSIDE',
          lastAlertTime: prevState.lastAlertTime
        });
      }

      results.push({
        geofenceId: gf.id,
        name: gf.name,
        distanceMeters: Math.round(distance),
        radiusMeters: gf.radius,
        status: isOutside ? 'OUTSIDE' : 'INSIDE',
        alertTriggered: alertTriggered ? alertTriggered.id : null
      });
    }

    return results;
  }
};

module.exports = geofenceService;

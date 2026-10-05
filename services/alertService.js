const db = require('../database/database');

const VALID_TYPES = ['SOS', 'GEOFENCE', 'MOTION', 'SYSTEM'];

// Motion alert cooldown tracker in-memory to prevent sensor jitter flooding
const motionCooldowns = new Map(); // key: deviceId_motionType -> timestamp

const alertService = {
  /**
   * Create and record an alert in the database.
   */
  createAlert({
    deviceId = 'TRACKX-01',
    type = 'SYSTEM',
    severity,
    message,
    latitude = null,
    longitude = null
  }) {
    const cleanType = String(type).toUpperCase().trim();
    if (!VALID_TYPES.includes(cleanType)) {
      throw new Error(`Invalid alert type: ${type}. Allowed: ${VALID_TYPES.join(', ')}`);
    }

    if (!message || typeof message !== 'string') {
      throw new Error('Alert message is required');
    }

    // Auto-determine severity if not provided
    let finalSeverity = severity;
    if (!finalSeverity) {
      if (cleanType === 'SOS') finalSeverity = 'critical';
      else if (cleanType === 'MOTION' && message.includes('Impact')) finalSeverity = 'critical';
      else if (cleanType === 'MOTION') finalSeverity = 'warning';
      else if (cleanType === 'GEOFENCE') finalSeverity = 'warning';
      else finalSeverity = 'info';
    }

    const stmt = db.prepare(`
      INSERT INTO alerts (device_id, type, severity, message, latitude, longitude, acknowledged, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(deviceId, cleanType, finalSeverity, message, latitude, longitude);

    return {
      id: result.lastInsertRowid,
      deviceId,
      type: cleanType,
      severity: finalSeverity,
      message,
      latitude,
      longitude,
      acknowledged: 0,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Retrieve list of alerts with optional filters.
   */
  getAlerts({ deviceId, type, unacknowledgedOnly = false, limit = 50 }) {
    let query = `SELECT * FROM alerts WHERE 1=1`;
    const params = [];

    if (deviceId) {
      query += ` AND device_id = ?`;
      params.push(deviceId);
    }

    if (type) {
      query += ` AND type = ?`;
      params.push(type.toUpperCase());
    }

    if (unacknowledgedOnly) {
      query += ` AND acknowledged = 0`;
    }

    query += ` ORDER BY timestamp DESC, id DESC LIMIT ?`;
    params.push(parseInt(limit, 10) || 50);

    return db.prepare(query).all(...params);
  },

  /**
   * Mark an alert as acknowledged.
   */
  acknowledgeAlert(id) {
    const stmt = db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE id = ?`);
    const info = stmt.run(id);
    return info.changes > 0;
  },

  /**
   * Mark all alerts as acknowledged.
   */
  acknowledgeAll(deviceId = null) {
    let stmt;
    if (deviceId) {
      stmt = db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE device_id = ? AND acknowledged = 0`);
      return stmt.run(deviceId).changes;
    } else {
      stmt = db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0`);
      return stmt.run().changes;
    }
  },

  /**
   * Process MPU6050 accelerometer/gyroscope reading and generate alerts if abnormal.
   */
  processMotion(deviceId, motion, latitude = null, longitude = null) {
    if (!motion || motion === 'NORMAL') return null;

    const normalizedMotion = motion.toUpperCase();
    const cooldownKey = `${deviceId}_${normalizedMotion}`;
    const now = Date.now();
    const lastTriggered = motionCooldowns.get(cooldownKey) || 0;

    // 15 second cooldown between identical motion alerts
    if (now - lastTriggered < 15000) {
      return null;
    }

    motionCooldowns.set(cooldownKey, now);

    let message = '';
    let severity = 'warning';

    if (normalizedMotion === 'POSSIBLE_IMPACT') {
      message = 'Possible Impact Detected: High G-Force acceleration detected by MPU6050.';
      severity = 'critical';
    } else if (normalizedMotion === 'ABNORMAL') {
      message = 'Abnormal Movement Detected: Sudden tilt or vibration detected by MPU6050.';
      severity = 'warning';
    } else {
      message = `Motion Event: ${motion}`;
      severity = 'info';
    }

    return this.createAlert({
      deviceId,
      type: 'MOTION',
      severity,
      message,
      latitude,
      longitude
    });
  }
};

module.exports = alertService;

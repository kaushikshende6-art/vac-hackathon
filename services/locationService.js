const db = require('../database/database');

/**
 * Calculates Haversine distance between two points in meters.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

/**
 * Validates coordinate inputs.
 */
function isValidCoordinate(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  return true;
}

const locationService = {
  haversineDistance,
  isValidCoordinate,

  /**
   * Save incoming GPS location record and update device state.
   */
  saveLocation(payload) {
    const {
      deviceId = 'TRACKX-01',
      latitude,
      longitude,
      speed = 0,
      satellites = 0,
      accuracy = 0,
      motion = 'NORMAL',
      altitude = 0,
      battery,
      timestamp = new Date().toISOString()
    } = payload;

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    const spd = Math.max(0, parseFloat(speed) || 0);
    const sats = parseInt(satellites, 10) || 0;
    const acc = Math.max(0, parseFloat(accuracy) || 0);
    const alt = parseFloat(altitude) || 0;

    if (!isValidCoordinate(lat, lon)) {
      throw new Error(`Invalid GPS coordinates: latitude=${lat}, longitude=${lon}`);
    }

    if (!deviceId || typeof deviceId !== 'string') {
      throw new Error('Invalid or missing deviceId');
    }

    // Insert location record
    const insertStmt = db.prepare(`
      INSERT INTO locations (device_id, latitude, longitude, speed, satellites, accuracy, motion, altitude, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(deviceId, lat, lon, spd, sats, acc, motion, alt, timestamp);

    // Upsert or update device last_seen and status
    const updateDeviceStmt = db.prepare(`
      INSERT INTO devices (device_id, name, status, last_seen, battery_level)
      VALUES (?, ?, 'ONLINE', ?, COALESCE(?, 100.0))
      ON CONFLICT(device_id) DO UPDATE SET
        status = 'ONLINE',
        last_seen = excluded.last_seen,
        battery_level = COALESCE(excluded.battery_level, devices.battery_level)
    `);
    updateDeviceStmt.run(deviceId, `TRACKX Tracker (${deviceId})`, timestamp, battery ? parseFloat(battery) : null);

    return {
      id: result.lastInsertRowid,
      deviceId,
      latitude: lat,
      longitude: lon,
      speed: spd,
      satellites: sats,
      accuracy: acc,
      motion,
      altitude: alt,
      timestamp
    };
  },

  /**
   * Retrieve the latest location point for a device.
   */
  getLatestLocation(deviceId = 'TRACKX-01') {
    const stmt = db.prepare(`
      SELECT l.*, d.name AS device_name, d.status AS device_status, d.last_seen, d.battery_level
      FROM locations l
      LEFT JOIN devices d ON l.device_id = d.device_id
      WHERE l.device_id = ?
      ORDER BY l.timestamp DESC, l.id DESC
      LIMIT 1
    `);
    return stmt.get(deviceId) || null;
  },

  /**
   * Retrieve location history in chronological order.
   */
  getHistory(deviceId = 'TRACKX-01', limit = 100, startDate = null, endDate = null) {
    let query = `SELECT * FROM locations WHERE device_id = ?`;
    const params = [deviceId];

    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY timestamp ASC, id ASC LIMIT ?`;
    params.push(parseInt(limit, 10) || 100);

    return db.prepare(query).all(...params);
  },

  /**
   * Calculate distance travelled and speed metrics for a device today.
   */
  getTodayStats(deviceId = 'TRACKX-01') {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT latitude, longitude, speed, timestamp
      FROM locations
      WHERE device_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC, id ASC
    `).all(deviceId, today + 'T00:00:00.000Z');

    let totalDistanceMeters = 0;
    let maxSpeed = 0;
    let speedSum = 0;

    for (let i = 0; i < rows.length; i++) {
      const cur = rows[i];
      if (cur.speed > maxSpeed) maxSpeed = cur.speed;
      speedSum += cur.speed;

      if (i > 0) {
        const prev = rows[i - 1];
        const dist = haversineDistance(prev.latitude, prev.longitude, cur.latitude, cur.longitude);
        // Ignore GPS jitter when stationary (e.g. jumps greater than 10km in 1 sec or small jitter < 2m)
        if (dist >= 2 && dist < 5000) {
          totalDistanceMeters += dist;
        }
      }
    }

    const avgSpeed = rows.length > 0 ? (speedSum / rows.length).toFixed(1) : 0;

    return {
      pointCount: rows.length,
      distanceKm: (totalDistanceMeters / 1000).toFixed(2),
      maxSpeedKmH: maxSpeed.toFixed(1),
      avgSpeedKmH: parseFloat(avgSpeed)
    };
  }
};

module.exports = locationService;

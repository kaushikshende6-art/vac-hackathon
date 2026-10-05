const db = require('../database/database');
const { haversineDistance } = require('./locationService');

const tripService = {
  /**
   * Get all trips for a device or overall.
   */
  getTrips(deviceId = null) {
    let query = `SELECT * FROM trips`;
    const params = [];
    if (deviceId) {
      query += ` WHERE device_id = ?`;
      params.push(deviceId);
    }
    query += ` ORDER BY start_time DESC, id DESC`;
    return db.prepare(query).all(...params);
  },

  /**
   * Get single trip and its chronological GPS trajectory points.
   */
  getTripDetails(tripId) {
    const trip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(tripId);
    if (!trip) return null;

    // Fetch all location points between trip start and end
    let pointsQuery = `
      SELECT id, latitude, longitude, speed, satellites, accuracy, motion, timestamp
      FROM locations
      WHERE device_id = ? AND timestamp >= ?
    `;
    const params = [trip.device_id, trip.start_time];

    if (trip.end_time) {
      pointsQuery += ` AND timestamp <= ?`;
      params.push(trip.end_time);
    }

    pointsQuery += ` ORDER BY timestamp ASC, id ASC`;
    const points = db.prepare(pointsQuery).all(...params);

    // Fetch alerts during this trip
    let alertQuery = `
      SELECT id, type, severity, message, timestamp
      FROM alerts
      WHERE device_id = ? AND timestamp >= ?
    `;
    const alertParams = [trip.device_id, trip.start_time];
    if (trip.end_time) {
      alertQuery += ` AND timestamp <= ?`;
      alertParams.push(trip.end_time);
    }
    alertQuery += ` ORDER BY timestamp ASC`;
    const alerts = db.prepare(alertQuery).all(...alertParams);

    return {
      ...trip,
      pointCount: points.length,
      points,
      alerts
    };
  },

  /**
   * Start a new trip.
   */
  startTrip(deviceId = 'TRACKX-01', title = null) {
    // Check if an active trip already exists
    const existing = db.prepare(`
      SELECT * FROM trips WHERE device_id = ? AND status = 'ACTIVE' LIMIT 1
    `).get(deviceId);

    if (existing) {
      return existing;
    }

    const defaultTitle = title || `Trip on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    const startTime = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO trips (device_id, title, start_time, distance, duration, average_speed, max_speed, status)
      VALUES (?, ?, ?, 0.0, 0, 0.0, 0.0, 'ACTIVE')
    `);

    const result = stmt.run(deviceId, defaultTitle, startTime);
    return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(result.lastInsertRowid);
  },

  /**
   * Stop an active trip and compute total metrics.
   */
  stopTrip(deviceId = 'TRACKX-01', tripId = null) {
    let trip;
    if (tripId) {
      trip = db.prepare(`SELECT * FROM trips WHERE id = ? AND device_id = ?`).get(tripId, deviceId);
    } else {
      trip = db.prepare(`SELECT * FROM trips WHERE device_id = ? AND status = 'ACTIVE' ORDER BY start_time DESC LIMIT 1`).get(deviceId);
    }

    if (!trip) {
      throw new Error('No active trip found to stop');
    }

    const endTime = new Date().toISOString();

    // Query points during this trip
    const points = db.prepare(`
      SELECT latitude, longitude, speed, timestamp
      FROM locations
      WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC, id ASC
    `).all(deviceId, trip.start_time, endTime);

    let totalDistMeters = 0;
    let maxSpeed = 0;
    let speedSum = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.speed > maxSpeed) maxSpeed = p.speed;
      speedSum += p.speed;

      if (i > 0) {
        const prev = points[i - 1];
        const dist = haversineDistance(prev.latitude, prev.longitude, p.latitude, p.longitude);
        if (dist >= 2 && dist < 5000) {
          totalDistMeters += dist;
        }
      }
    }

    const durationSeconds = Math.max(0, Math.round((new Date(endTime) - new Date(trip.start_time)) / 1000));
    const avgSpeed = points.length > 0 ? (speedSum / points.length).toFixed(1) : 0;
    const distanceKm = (totalDistMeters / 1000).toFixed(2);

    const alertCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM alerts
      WHERE device_id = ? AND timestamp >= ? AND timestamp <= ?
    `).get(deviceId, trip.start_time, endTime);

    const updateStmt = db.prepare(`
      UPDATE trips
      SET end_time = ?,
          distance = ?,
          duration = ?,
          average_speed = ?,
          max_speed = ?,
          alert_count = ?,
          status = 'COMPLETED'
      WHERE id = ?
    `);

    updateStmt.run(endTime, distanceKm, durationSeconds, avgSpeed, maxSpeed.toFixed(1), alertCountRow.count, trip.id);

    return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(trip.id);
  },

  /**
   * Seed a realistic demo trip if none exist.
   */
  seedDemoTripIfEmpty() {
    const count = db.prepare(`SELECT COUNT(*) as count FROM trips`).get().count;
    if (count > 0) return;

    // Create a realistic sample historical trip
    const now = Date.now();
    const startTime = new Date(now - 3600 * 1000 * 2).toISOString(); // 2 hours ago
    const endTime = new Date(now - 3600 * 1000 * 1).toISOString();   // 1 hour ago

    const baseLat = 21.1458;
    const baseLon = 79.0882;

    const stmt = db.prepare(`
      INSERT INTO trips (device_id, title, start_time, end_time, distance, duration, average_speed, max_speed, alert_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')
    `);

    const result = stmt.run('TRACKX-01', 'Morning Campus Transit Route', startTime, endTime, 6.45, 3600, 24.5, 48.2, 1);
    const tripId = result.lastInsertRowid;

    // Insert 15 realistic path points for this trip
    const insertLoc = db.prepare(`
      INSERT INTO locations (device_id, latitude, longitude, speed, satellites, accuracy, motion, altitude, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 15; i++) {
      const stepFraction = i / 14;
      const lat = baseLat + Math.sin(stepFraction * Math.PI) * 0.015 + (i * 0.001);
      const lon = baseLon + (stepFraction * 0.030);
      const speed = 20 + Math.sin(i) * 15;
      const pointTime = new Date(new Date(startTime).getTime() + (i * 240 * 1000)).toISOString();
      insertLoc.run('TRACKX-01', lat, lon, Math.max(5, speed), 9, 2.8, 'NORMAL', 310 + i * 2, pointTime);
    }
  }
};

// Auto seed initial demo trip
tripService.seedDemoTripIfEmpty();

module.exports = tripService;

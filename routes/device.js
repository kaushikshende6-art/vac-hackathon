const express = require('express');
const router = express.Router();
const db = require('../database/database');
const locationService = require('../services/locationService');

const TIMEOUT_SECONDS = parseInt(process.env.DEVICE_OFFLINE_TIMEOUT, 10) || 60;

/**
 * Helper to compute device online status & telemetry summary.
 */
function getComputedDeviceStatus(deviceId = 'TRACKX-01') {
  let device = db.prepare(`SELECT * FROM devices WHERE device_id = ?`).get(deviceId);
  
  if (!device) {
    // If device doesn't exist yet, insert it
    db.prepare(`
      INSERT OR IGNORE INTO devices (device_id, name, status, battery_level, firmware_version)
      VALUES (?, ?, 'OFFLINE', 100.0, 'v1.0.0')
    `).run(deviceId, `TRACKX Device (${deviceId})`);
    device = db.prepare(`SELECT * FROM devices WHERE device_id = ?`).get(deviceId);
  }

  const latestLoc = locationService.getLatestLocation(deviceId);

  let isOnline = false;
  let secondsAgo = null;

  if (device.last_seen) {
    const lastSeenTime = new Date(device.last_seen).getTime();
    secondsAgo = Math.max(0, Math.round((Date.now() - lastSeenTime) / 1000));
    isOnline = secondsAgo <= TIMEOUT_SECONDS;
  }

  // Update status in database if changed
  const computedStatus = isOnline ? 'ONLINE' : 'OFFLINE';
  if (device.status !== computedStatus) {
    db.prepare(`UPDATE devices SET status = ? WHERE device_id = ?`).run(computedStatus, deviceId);
    device.status = computedStatus;
  }

  // GPS satellite fix status
  let gpsStatus = 'NO FIX';
  if (latestLoc && latestLoc.satellites >= 3 && latestLoc.accuracy < 50) {
    gpsStatus = 'CONNECTED';
  } else if (latestLoc && latestLoc.satellites > 0) {
    gpsStatus = 'ACQUIRING';
  }

  return {
    deviceId: device.device_id,
    name: device.name,
    status: computedStatus,
    isOnline,
    gpsStatus,
    lastSeen: device.last_seen,
    secondsSinceLastSeen: secondsAgo,
    batteryLevel: device.battery_level,
    firmwareVersion: device.firmware_version,
    timeoutSeconds: TIMEOUT_SECONDS,
    telemetry: latestLoc ? {
      latitude: latestLoc.latitude,
      longitude: latestLoc.longitude,
      speed: latestLoc.speed,
      satellites: latestLoc.satellites,
      accuracy: latestLoc.accuracy,
      motion: latestLoc.motion,
      altitude: latestLoc.altitude,
      timestamp: latestLoc.timestamp
    } : null
  };
}

/**
 * GET /api/device/status
 */
router.get('/status', (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'TRACKX-01';
    const statusData = getComputedDeviceStatus(deviceId);
    return res.json({ success: true, data: statusData });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/device
 * List all devices with computed online/offline statuses.
 */
router.get('/', (req, res) => {
  try {
    const devices = db.prepare(`SELECT * FROM devices ORDER BY id ASC`).all();
    const result = devices.map(d => getComputedDeviceStatus(d.device_id));
    return res.json({ success: true, count: result.length, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/device/:id
 */
router.get('/:id', (req, res) => {
  try {
    const statusData = getComputedDeviceStatus(req.params.id);
    return res.json({ success: true, data: statusData });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/device
 * Register or update device name.
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, name } = req.body;
    if (!deviceId) {
      return res.status(400).json({ success: false, error: 'deviceId is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO devices (device_id, name, status)
      VALUES (?, ?, 'OFFLINE')
      ON CONFLICT(device_id) DO UPDATE SET name = COALESCE(excluded.name, devices.name)
    `);
    stmt.run(deviceId, name || `TRACKX Unit (${deviceId})`);

    const updated = getComputedDeviceStatus(deviceId);
    return res.json({ success: true, message: 'Device updated', data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;

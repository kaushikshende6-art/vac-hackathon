const express = require('express');
const router = express.Router();
const alertService = require('../services/alertService');
const locationService = require('../services/locationService');
const db = require('../database/database');

/**
 * POST /api/alerts
 * Triggered by ESP8266 (SOS button, MPU6050) or Web UI.
 */
router.post('/', (req, res) => {
  try {
    const { deviceId = 'TRACKX-01', type = 'SOS', message, latitude, longitude, severity } = req.body;

    let finalLat = latitude !== undefined && latitude !== null ? parseFloat(latitude) : null;
    let finalLon = longitude !== undefined && longitude !== null ? parseFloat(longitude) : null;

    // If coordinates were not included in the payload, backfill with the tracker's latest known coordinates
    if (finalLat === null || finalLon === null) {
      const latest = locationService.getLatestLocation(deviceId);
      if (latest) {
        finalLat = latest.latitude;
        finalLon = latest.longitude;
      }
    }

    let defaultMsg = message;
    if (!defaultMsg) {
      if (type.toUpperCase() === 'SOS') {
        defaultMsg = `EMERGENCY: SOS button triggered by ${deviceId}! Immediate response required.`;
      } else {
        defaultMsg = `Alert triggered by ${deviceId} (${type})`;
      }
    }

    const alert = alertService.createAlert({
      deviceId,
      type,
      severity,
      message: defaultMsg,
      latitude: finalLat,
      longitude: finalLon
    });

    return res.status(201).json({
      success: true,
      message: 'Alert registered successfully',
      data: alert
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/alerts
 * List alerts with optional filters.
 */
router.get('/', (req, res) => {
  try {
    const { deviceId, type, unacknowledgedOnly, limit } = req.query;
    const alerts = alertService.getAlerts({
      deviceId,
      type,
      unacknowledgedOnly: unacknowledgedOnly === 'true' || unacknowledgedOnly === '1',
      limit: parseInt(limit, 10) || 50
    });

    return res.json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/alerts/summary
 * Unacknowledged counts for header badge and audio alarm trigger.
 */
router.get('/summary', (req, res) => {
  try {
    const totalUnack = db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0`).get().count;
    const sosUnack = db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0 AND type = 'SOS'`).get().count;
    const criticalUnack = db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0 AND severity = 'critical'`).get().count;
    const latestAlert = db.prepare(`SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 1`).get();

    return res.json({
      success: true,
      data: {
        totalUnacknowledged: totalUnack,
        sosUnacknowledged: sosUnack,
        criticalUnacknowledged: criticalUnack,
        latestAlert: latestAlert || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/alerts/:id/ack
 * Mark alert acknowledged.
 */
router.patch('/:id/ack', (req, res) => {
  try {
    const success = alertService.acknowledgeAlert(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    return res.json({ success: true, message: `Alert #${req.params.id} acknowledged` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/alerts/ack-all
 * Mark all alerts acknowledged.
 */
router.post('/ack-all', (req, res) => {
  try {
    const { deviceId } = req.body || {};
    const count = alertService.acknowledgeAll(deviceId);
    return res.json({ success: true, message: `Acknowledged ${count} alerts`, acknowledgedCount: count });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

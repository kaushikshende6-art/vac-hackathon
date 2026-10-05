const express = require('express');
const router = express.Router();
const locationService = require('../services/locationService');
const geofenceService = require('../services/geofenceService');
const alertService = require('../services/alertService');

/**
 * POST /api/location
 * Ingest GPS telemetry from ESP8266 or simulator.
 */
router.post('/', (req, res) => {
  try {
    const { deviceId, latitude, longitude, speed, satellites, accuracy, motion, altitude, battery, timestamp } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required coordinates: latitude and longitude are required'
      });
    }

    const saved = locationService.saveLocation({
      deviceId: deviceId || 'TRACKX-01',
      latitude,
      longitude,
      speed,
      satellites,
      accuracy,
      motion,
      altitude,
      battery,
      timestamp
    });

    // Run geofence boundary checks
    const geofenceCheck = geofenceService.checkBreaches(saved.deviceId, saved.latitude, saved.longitude);

    // Run motion sensor analysis
    let motionAlert = null;
    if (motion && motion !== 'NORMAL') {
      motionAlert = alertService.processMotion(saved.deviceId, motion, saved.latitude, saved.longitude);
    }

    return res.status(201).json({
      success: true,
      message: 'Location saved successfully',
      data: saved,
      geofenceCheck,
      motionAlert: motionAlert ? motionAlert.id : null
    });
  } catch (err) {
    console.error('Error saving location:', err.message);
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/location/latest
 * Get most recent GPS position and stats for a device.
 */
router.get('/latest', (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'TRACKX-01';
    const latest = locationService.getLatestLocation(deviceId);
    const stats = locationService.getTodayStats(deviceId);

    return res.json({
      success: true,
      deviceId,
      data: latest,
      stats
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/location/history
 * Chronological GPS trail for map polylines and route reconstruction.
 */
router.get('/history', (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'TRACKX-01';
    const limit = parseInt(req.query.limit, 10) || 100;
    const { startDate, endDate } = req.query;

    const points = locationService.getHistory(deviceId, limit, startDate, endDate);

    return res.json({
      success: true,
      deviceId,
      count: points.length,
      data: points
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/location/history/:deviceId
 */
router.get('/history/:deviceId', (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const limit = parseInt(req.query.limit, 10) || 100;
    const points = locationService.getHistory(deviceId, limit);

    return res.json({
      success: true,
      deviceId,
      count: points.length,
      data: points
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

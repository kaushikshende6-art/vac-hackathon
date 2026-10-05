const express = require('express');
const router = express.Router();
const geofenceService = require('../services/geofenceService');
const locationService = require('../services/locationService');

/**
 * GET /api/geofence
 * Return all geofences.
 */
router.get('/', (req, res) => {
  try {
    const list = geofenceService.getAll();
    return res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/geofence/:id
 */
router.get('/:id', (req, res) => {
  try {
    const item = geofenceService.getById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Geofence not found' });
    return res.json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/geofence
 * Create a new safe zone.
 */
router.post('/', (req, res) => {
  try {
    const { name, latitude, longitude, radius, active, color } = req.body;
    const created = geofenceService.create({ name, latitude, longitude, radius, active, color });
    return res.status(201).json({ success: true, message: 'Geofence created', data: created });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/geofence/:id
 * Update an existing geofence.
 */
router.put('/:id', (req, res) => {
  try {
    const updated = geofenceService.update(req.params.id, req.body);
    return res.json({ success: true, message: 'Geofence updated', data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/geofence/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = geofenceService.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Geofence not found' });
    return res.json({ success: true, message: `Geofence #${req.params.id} deleted` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/geofence/status/current
 * Check current tracker location status against all geofences.
 */
router.get('/status/current', (req, res) => {
  try {
    const deviceId = req.query.deviceId || 'TRACKX-01';
    const latest = locationService.getLatestLocation(deviceId);
    if (!latest) {
      return res.json({ success: true, message: 'No location available yet', data: [] });
    }

    const checks = geofenceService.checkBreaches(deviceId, latest.latitude, latest.longitude);
    return res.json({
      success: true,
      deviceId,
      currentLocation: { latitude: latest.latitude, longitude: latest.longitude },
      geofences: checks
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

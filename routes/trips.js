const express = require('express');
const router = express.Router();
const tripService = require('../services/tripService');

/**
 * GET /api/trips
 * List trips.
 */
router.get('/', (req, res) => {
  try {
    const { deviceId } = req.query;
    const trips = tripService.getTrips(deviceId);
    return res.json({ success: true, count: trips.length, data: trips });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/trips/:id
 * Fetch complete trip details with full GPS points for route polyline mapping.
 */
router.get('/:id', (req, res) => {
  try {
    const trip = tripService.getTripDetails(req.params.id);
    if (!trip) {
      return res.status(404).json({ success: false, error: 'Trip not found' });
    }
    return res.json({ success: true, data: trip });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/trips/start
 * Begin a new tracking trip.
 */
router.post('/start', (req, res) => {
  try {
    const { deviceId = 'TRACKX-01', title } = req.body;
    const trip = tripService.startTrip(deviceId, title);
    return res.status(201).json({ success: true, message: 'Trip started', data: trip });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/trips/stop
 * End active trip and calculate distance, duration, avg speed, max speed.
 */
router.post('/stop', (req, res) => {
  try {
    const { deviceId = 'TRACKX-01', tripId } = req.body;
    const completed = tripService.stopTrip(deviceId, tripId);
    return res.json({ success: true, message: 'Trip completed', data: completed });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;

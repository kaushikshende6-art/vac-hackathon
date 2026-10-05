const express = require('express');
const router = express.Router();
const locationService = require('../services/locationService');
const geofenceService = require('../services/geofenceService');
const alertService = require('../services/alertService');
const db = require('../database/database');

// Base coordinates: College Campus (e.g. Nagpur / Tech Campus)
const BASE_LAT = 21.1458;
const BASE_LON = 79.0882;

// Realistic 16-waypoint circular test driving route
const SIMULATION_ROUTE = [
  { lat: 21.1458, lon: 79.0882, speed: 0,   sats: 8,  name: "Campus Gate (Safe Zone Inside)" },
  { lat: 21.1465, lon: 79.0890, speed: 18,  sats: 9,  name: "Academic Block North" },
  { lat: 21.1472, lon: 79.0901, speed: 28,  sats: 9,  name: "Library Avenue" },
  { lat: 21.1480, lon: 79.0915, speed: 34,  sats: 10, name: "Engineering Complex" },
  { lat: 21.1492, lon: 79.0930, speed: 41,  sats: 10, name: "East Ring Road (Approaching Perimeter)" },
  { lat: 21.1510, lon: 79.0955, speed: 45,  sats: 11, name: "Campus Outer Boulevard (BREACH THRESHOLD)" },
  { lat: 21.1535, lon: 79.0988, speed: 52,  sats: 11, name: "Highway Bypass (OUTSIDE GEOFENCE)" },
  { lat: 21.1550, lon: 79.1020, speed: 48,  sats: 10, name: "Metro Station Intersection" },
  { lat: 21.1530, lon: 79.1005, speed: 38,  sats: 10, name: "Return Loop Junction" },
  { lat: 21.1505, lon: 79.0965, speed: 32,  sats: 9,  name: "Re-entering Campus Perimeter" },
  { lat: 21.1488, lon: 79.0925, speed: 26,  sats: 9,  name: "Sports Complex & Stadium" },
  { lat: 21.1470, lon: 79.0898, speed: 20,  sats: 8,  name: "Hostel Quadrangle" },
  { lat: 21.1460, lon: 79.0885, speed: 12,  sats: 8,  name: "Innovation & Robotics Lab" },
  { lat: 21.1458, lon: 79.0882, speed: 0,   sats: 8,  name: "Main Campus Station (Stationary)" }
];

let simIndex = 0;

/**
 * POST /api/demo/step
 * Step forward along the simulated GPS trajectory.
 */
router.post('/step', (req, res) => {
  try {
    const deviceId = req.body.deviceId || 'TRACKX-01';
    const wp = SIMULATION_ROUTE[simIndex];
    simIndex = (simIndex + 1) % SIMULATION_ROUTE.length;

    const saved = locationService.saveLocation({
      deviceId,
      latitude: wp.lat,
      longitude: wp.lon,
      speed: wp.speed,
      satellites: wp.sats,
      accuracy: 2.8,
      motion: 'NORMAL',
      altitude: 312.5,
      battery: 94.0,
      timestamp: new Date().toISOString()
    });

    const geofenceCheck = geofenceService.checkBreaches(deviceId, wp.lat, wp.lon);

    return res.json({
      success: true,
      message: `[DEMO MODE] Advanced to waypoint ${simIndex} / ${SIMULATION_ROUTE.length}: ${wp.name}`,
      waypoint: { index: simIndex, total: SIMULATION_ROUTE.length, name: wp.name },
      location: saved,
      geofenceCheck
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/breach
 * Move device outside safe zone immediately to demonstrate geofence breach.
 */
router.post('/breach', (req, res) => {
  try {
    const deviceId = req.body.deviceId || 'TRACKX-01';
    // Move ~1.5km north-east outside the 500m safe zone
    const breachLat = BASE_LAT + 0.015;
    const breachLon = BASE_LON + 0.015;

    const saved = locationService.saveLocation({
      deviceId,
      latitude: breachLat,
      longitude: breachLon,
      speed: 46.5,
      satellites: 10,
      accuracy: 2.5,
      motion: 'NORMAL',
      altitude: 315.0,
      battery: 89.0,
      timestamp: new Date().toISOString()
    });

    const geofenceCheck = geofenceService.checkBreaches(deviceId, breachLat, breachLon);

    return res.json({
      success: true,
      message: '[DEMO MODE] Geofence breach triggered! Device moved outside safe zone perimeter.',
      location: saved,
      geofenceCheck
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/impact
 * Simulate MPU6050 sudden high-G impact event.
 */
router.post('/impact', (req, res) => {
  try {
    const deviceId = req.body.deviceId || 'TRACKX-01';
    const latest = locationService.getLatestLocation(deviceId) || {
      latitude: BASE_LAT,
      longitude: BASE_LON
    };

    const saved = locationService.saveLocation({
      deviceId,
      latitude: latest.latitude,
      longitude: latest.longitude,
      speed: 0,
      satellites: 9,
      accuracy: 3.0,
      motion: 'POSSIBLE_IMPACT',
      altitude: 310.0,
      battery: 88.0,
      timestamp: new Date().toISOString()
    });

    const alert = alertService.processMotion(deviceId, 'POSSIBLE_IMPACT', latest.latitude, latest.longitude);

    return res.json({
      success: true,
      message: '[DEMO MODE] MPU6050 High-G Possible Impact simulated successfully.',
      alert,
      location: saved
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/sos
 * Simulate pressing the physical ESP8266 SOS button.
 */
router.post('/sos', (req, res) => {
  try {
    const deviceId = req.body.deviceId || 'TRACKX-01';
    const latest = locationService.getLatestLocation(deviceId) || {
      latitude: BASE_LAT,
      longitude: BASE_LON
    };

    const alert = alertService.createAlert({
      deviceId,
      type: 'SOS',
      severity: 'critical',
      message: `[DEMO] EMERGENCY SOS triggered from ${deviceId}! Immediate assistance required at (${latest.latitude.toFixed(4)}, ${latest.longitude.toFixed(4)}).`,
      latitude: latest.latitude,
      longitude: latest.longitude
    });

    return res.json({
      success: true,
      message: '[DEMO MODE] Emergency SOS broadcast successfully triggered.',
      alert
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/demo/reset
 * Cleanly reset tracker back to campus center and safe zone.
 */
router.post('/reset', (req, res) => {
  try {
    const deviceId = req.body.deviceId || 'TRACKX-01';
    simIndex = 0;

    // Reset location to base
    const saved = locationService.saveLocation({
      deviceId,
      latitude: BASE_LAT,
      longitude: BASE_LON,
      speed: 0,
      satellites: 8,
      accuracy: 2.2,
      motion: 'NORMAL',
      altitude: 310.0,
      battery: 100.0,
      timestamp: new Date().toISOString()
    });

    // Mark all existing alerts acknowledged
    alertService.acknowledgeAll(deviceId);

    // Create system notification
    alertService.createAlert({
      deviceId,
      type: 'SYSTEM',
      severity: 'info',
      message: '[DEMO MODE] Tracker reset to Campus Safe Zone center. Ready for live demonstration.',
      latitude: BASE_LAT,
      longitude: BASE_LON
    });

    return res.json({
      success: true,
      message: '[DEMO MODE] Reset complete. Tracker placed at campus base coordinates.',
      location: saved
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

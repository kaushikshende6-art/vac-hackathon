const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize Database connection & auto-migrate
const db = require('./database/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.endsWith('.ico')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/location', require('./routes/location'));
app.use('/api/device', require('./routes/device'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/geofence', require('./routes/geofence'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/demo', require('./routes/demo'));

// Health Check endpoint (useful for Render keep-alive & monitoring)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'TRACKX Smart GPS Live Tracking & Safety Platform',
    version: '1.0.0',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Explicit page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/tracking', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

app.get('/navigation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'navigation.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/alerts', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'alerts.html'));
});

app.get('/geofence', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'geofence.html'));
});

app.get('/device', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'device.html'));
});

app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

// 404 Handler for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Fallback to dashboard for unknown routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start Express Server (binds to 0.0.0.0 for local & cloud environments like Render)
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('  🛰️  TRACKX — Smart GPS Live Tracking & Safety Platform');
  console.log(`  🌐 Server running on: http://0.0.0.0:${PORT}`);
  console.log(`  📡 ESP8266 REST API endpoint: /api/location`);
  console.log(`  🧪 Demo Mode: Available in UI & /api/demo endpoints`);
  console.log('====================================================');
});

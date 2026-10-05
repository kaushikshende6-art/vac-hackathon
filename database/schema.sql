-- ===================================================
-- TRACKX Database Schema (SQLite)
-- Smart GPS Live Tracking & Safety Platform
-- ===================================================

-- 1. Devices Table
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'OFFLINE',
  battery_level REAL DEFAULT 100.0,
  firmware_version TEXT DEFAULT '1.0.0',
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Locations Table
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  speed REAL DEFAULT 0.0,
  satellites INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0.0,
  motion TEXT DEFAULT 'NORMAL',
  altitude REAL DEFAULT 0.0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'SOS', 'GEOFENCE', 'MOTION', 'SYSTEM'
  severity TEXT DEFAULT 'warning', -- 'critical', 'warning', 'info'
  message TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  acknowledged INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Geofences Table
CREATE TABLE IF NOT EXISTS geofences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius REAL NOT NULL, -- in meters
  active INTEGER DEFAULT 1,
  color TEXT DEFAULT '#38bdf8',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Trips Table
CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  title TEXT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  distance REAL DEFAULT 0.0, -- in kilometers
  duration INTEGER DEFAULT 0, -- in seconds
  average_speed REAL DEFAULT 0.0,
  max_speed REAL DEFAULT 0.0,
  alert_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'COMPLETED', -- 'ACTIVE', 'COMPLETED'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_locations_device_time ON locations(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_locations_time ON locations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device_time ON alerts(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_ack ON alerts(acknowledged, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trips_device ON trips(device_id, start_time DESC);

-- Default Seed Data
INSERT OR IGNORE INTO devices (device_id, name, status, battery_level, firmware_version)
VALUES ('TRACKX-01', 'TRACKX NodeMCU Tracker #1', 'OFFLINE', 100.0, 'v1.2.0');

INSERT OR IGNORE INTO geofences (id, name, latitude, longitude, radius, active, color)
VALUES (1, 'College Campus Perimeter', 21.1458, 79.0882, 500.0, 1, '#10b981');

INSERT OR IGNORE INTO alerts (device_id, type, severity, message, latitude, longitude, acknowledged)
VALUES ('TRACKX-01', 'SYSTEM', 'info', 'TRACKX Safety Platform initialized. Ready for ESP8266 telemetry.', 21.1458, 79.0882, 1);

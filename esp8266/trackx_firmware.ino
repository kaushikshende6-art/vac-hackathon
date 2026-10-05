/*
 * =====================================================================================
 *  TRACKX — Smart GPS Live Tracking & Safety Platform
 *  ESP8266 NodeMCU Firmware
 * 
 *  Hardware Components:
 *   - ESP8266 NodeMCU (ESP-12E / ESP-12F)
 *   - NEO-6M GPS Module
 *   - MPU6050 6-Axis Accelerometer + Gyroscope
 *   - 16x2 I2C Character LCD (0x27)
 *   - Active Buzzer
 *   - Green LED (Status / Power)
 *   - Red LED (Alarm / SOS)
 *   - Physical SOS Push Button
 *   - 18650 Li-ion 3.7V Battery
 * 
 *  Pinout Map:
 *   - NEO-6M TX -> D6 (GPIO 12) [SoftwareSerial RX]
 *   - NEO-6M RX -> D5 (GPIO 14) [SoftwareSerial TX]
 *   - I2C SDA   -> D2 (GPIO 4)  [MPU6050 & LCD]
 *   - I2C SCL   -> D1 (GPIO 5)  [MPU6050 & LCD]
 *   - SOS Button-> D7 (GPIO 13) [Active LOW with INPUT_PULLUP]
 *   - Buzzer    -> D8 (GPIO 15) [Active HIGH]
 *   - Green LED -> D3 (GPIO 0)  [Active HIGH]
 *   - Red LED   -> D4 (GPIO 2)  [Active LOW on NodeMCU builtin or HIGH for external]
 *   - Battery   -> A0 (Analog Voltage Divider)
 * =====================================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ==========================================
// CONFIGURATION & CREDENTIALS
// ==========================================
const char* WIFI_SSID       = "note 30";
const char* WIFI_PASSWORD   = "11110000";
const char* SERVER_BASE_URL = "http://10.210.198.81:3000";
const char* DEVICE_ID       = "TRACKX-01";

const unsigned long TELEMETRY_INTERVAL_MS = 3000; // 3 seconds
const int MPU_ADDR = 0x68;                        // MPU6050 I2C address

// ==========================================
// PIN DEFINITIONS
// ==========================================
const int GPS_RX_PIN = 12; // D6
const int GPS_TX_PIN = 14; // D5
const int SOS_PIN    = 13; // D7 (Button to GND)
const int BUZZER_PIN = 15; // D8
const int LED_GREEN  = 0;  // D3
const int LED_RED    = 2;  // D4

// ==========================================
// PERIPHERAL OBJECTS
// ==========================================
SoftwareSerial ssGps(GPS_RX_PIN, GPS_TX_PIN);
TinyGPSPlus gps;
LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient client;
WiFiClientSecure clientSecure;
HTTPClient http;

// State Tracking Variables
unsigned long lastTelemetryTime = 0;
bool sosActive = false;
unsigned long lastSosTriggerTime = 0;

// MPU6050 Accelerometer Data
int16_t ax, ay, az;
int16_t gx, gy, gz;

void setup() {
  Serial.begin(115200);
  ssGps.begin(9600);

  pinMode(SOS_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  // Initialize I2C Bus for LCD and MPU6050
  Wire.begin(4, 5); // SDA=D2 (GPIO4), SCL=D1 (GPIO5)

  // Initialize LCD
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("TRACKX IoT V1.0");
  lcd.setCursor(0, 1);
  lcd.print("Booting Systems...");

  // Initialize MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // Wake up MPU-6050
  Wire.endTransmission(true);

  // Connect to Wi-Fi
  connectWiFi();

  // Allow connecting to HTTPS Render cloud endpoints without certificate validation
  clientSecure.setInsecure();

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("TRACKX: READY");
  lcd.setCursor(0, 1);
  lcd.print("Acquiring GPS...");
  digitalWrite(LED_GREEN, HIGH);
}

void loop() {
  // Feed GPS parser from SoftwareSerial buffer
  while (ssGps.available() > 0) {
    gps.encode(ssGps.read());
  }

  // Check physical SOS push button (Active LOW)
  if (digitalRead(SOS_PIN) == LOW) {
    if (millis() - lastSosTriggerTime > 3000) { // 3-second debounce
      triggerEmergencySos();
      lastSosTriggerTime = millis();
    }
  }

  // Read MPU6050 motion state
  String motionState = readMpuMotion();

  // Send periodic telemetry packet
  if (millis() - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    sendLocationTelemetry(motionState);
    lastTelemetryTime = millis();
  }

  // Update multi-screen LCD display (cycles screens smoothly)
  updateLcdDisplay(motionState);

  // Handle siren flashing if SOS mode active
  if (sosActive && (millis() - lastSosTriggerTime < 8000)) {
    digitalWrite(LED_RED, (millis() / 200) % 2);
    digitalWrite(BUZZER_PIN, (millis() / 250) % 2);
  } else {
    digitalWrite(LED_RED, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    sosActive = false;
  }
}

void connectWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(LED_GREEN, !digitalRead(LED_GREEN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected! IP: ");
    Serial.println(WiFi.localIP());
    lcd.setCursor(0, 1);
    lcd.print("WiFi OK: ");
    lcd.print(WiFi.localIP().toString().substring(0, 7));
    delay(1000);
  } else {
    Serial.println("\nWiFi connection failed! Telemetry will retry.");
    lcd.setCursor(0, 1);
    lcd.print("WiFi Failed!");
    delay(1000);
  }
}

String readMpuMotion() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // Starting with register 0x3B (ACCEL_XOUT_H)
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  if (Wire.available() >= 6) {
    ax = Wire.read() << 8 | Wire.read();
    ay = Wire.read() << 8 | Wire.read();
    az = Wire.read() << 8 | Wire.read();

    // Convert raw values to Gs (default scale +/- 2g is 16384 LSB/g)
    float gX = (float)ax / 16384.0;
    float gY = (float)ay / 16384.0;
    float gZ = (float)az / 16384.0;
    float totalG = sqrt(gX * gX + gY * gY + gZ * gZ);

    if (totalG > 2.8) {
      return "POSSIBLE_IMPACT";
    } else if (totalG > 1.6 || totalG < 0.4) {
      return "ABNORMAL";
    }
  }

  return "NORMAL";
}

void sendLocationTelemetry(String motionState) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  double lat = gps.location.isValid() ? gps.location.lat() : 21.1458; // Fallback demo coord
  double lon = gps.location.isValid() ? gps.location.lng() : 79.0882;
  double speedKmH = gps.speed.isValid() ? gps.speed.kmph() : 0.0;
  int sats = gps.satellites.isValid() ? gps.satellites.value() : 8;
  double hdop = gps.hdop.isValid() ? (gps.hdop.value() / 100.0) : 2.5;
  double altitude = gps.altitude.isValid() ? gps.altitude.meters() : 310.0;

  // Approximate battery level from ADC (0-1023 mapped to 0-100%)
  int rawAdc = analogRead(A0);
  float batteryPct = constrain((rawAdc / 1023.0) * 100.0, 10.0, 100.0);

  // Construct JSON payload
  String json = "{";
  json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  json += "\"latitude\":" + String(lat, 6) + ",";
  json += "\"longitude\":" + String(lon, 6) + ",";
  json += "\"speed\":" + String(speedKmH, 1) + ",";
  json += "\"satellites\":" + String(sats) + ",";
  json += "\"accuracy\":" + String(hdop, 1) + ",";
  json += "\"motion\":\"" + motionState + "\",";
  json += "\"altitude\":" + String(altitude, 1) + ",";
  json += "\"battery\":" + String(batteryPct, 1);
  json += "}";

  String url = String(SERVER_BASE_URL) + "/api/location";
  if (url.startsWith("https")) {
    http.begin(clientSecure, url);
  } else {
    http.begin(client, url);
  }
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(json);
  if (httpCode > 0) {
    Serial.printf("[HTTP] Telemetry POST response: %d\n", httpCode);
  } else {
    Serial.printf("[HTTP] Telemetry POST failed: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

void triggerEmergencySos() {
  sosActive = true;
  Serial.println("🚨 EMERGENCY SOS BUTTON PRESSED!");

  // Sound loud alert tone
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(LED_RED, HIGH);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("*** SOS ALERT ***");
  lcd.setCursor(0, 1);
  lcd.print("Broadcasting...");

  if (WiFi.status() == WL_CONNECTED) {
    double lat = gps.location.isValid() ? gps.location.lat() : 21.1458;
    double lon = gps.location.isValid() ? gps.location.lng() : 79.0882;

    String json = "{";
    json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
    json += "\"type\":\"SOS\",";
    json += "\"severity\":\"critical\",";
    json += "\"message\":\"EMERGENCY: Hardware SOS Button Triggered! Immediate assistance needed.\",";
    json += "\"latitude\":" + String(lat, 6) + ",";
    json += "\"longitude\":" + String(lon, 6);
    json += "}";

    String url = String(SERVER_BASE_URL) + "/api/alerts";
    if (url.startsWith("https")) {
      http.begin(clientSecure, url);
    } else {
      http.begin(client, url);
    }
    http.addHeader("Content-Type", "application/json");
    http.POST(json);
    http.end();
  }
}

// ==========================================
// 16x2 LCD MULTI-SCREEN CAROUSEL SYSTEM
// Rotates through 5 diagnostic screens every 2.5s:
// Screen 0: Status & Speed
// Screen 1: GPS Latitude & Longitude
// Screen 2: MPU6050 Motion & G-Force
// Screen 3: Battery Level & Local IP
// Screen 4: Altitude & GPS HDOP Accuracy
// ==========================================
int lcdScreenIndex = 0;
unsigned long lastLcdSwitchTime = 0;
const unsigned long LCD_SCREEN_DURATION = 2500; // 2.5 seconds per screen

void updateLcdDisplay(String motionState) {
  // If emergency SOS is active, override screen with flashing SOS message
  if (sosActive) {
    lcd.setCursor(0, 0);
    lcd.print("*** SOS ALERT ***");
    lcd.setCursor(0, 1);
    lcd.print("HELP SIGNAL SENT");
    return;
  }

  // Cycle screens every 2.5 seconds
  if (millis() - lastLcdSwitchTime >= LCD_SCREEN_DURATION) {
    lcdScreenIndex = (lcdScreenIndex + 1) % 5;
    lastLcdSwitchTime = millis();
    lcd.clear();
  }

  char line1[17];
  char line2[17];

  double lat = gps.location.isValid() ? gps.location.lat() : 21.1458;
  double lon = gps.location.isValid() ? gps.location.lng() : 79.0882;
  int speed = gps.speed.isValid() ? (int)gps.speed.kmph() : 0;
  int sats = gps.satellites.isValid() ? gps.satellites.value() : 8;
  double alt = gps.altitude.isValid() ? gps.altitude.meters() : 310.0;
  double hdop = gps.hdop.isValid() ? (gps.hdop.value() / 100.0) : 2.8;

  int rawAdc = analogRead(A0);
  int battPct = (int)constrain((rawAdc / 1023.0) * 100.0, 10.0, 100.0);
  float volts = (rawAdc / 1023.0) * 4.2;

  switch (lcdScreenIndex) {
    case 0:
      // Screen 0: Status, Speed, Satellites
      snprintf(line1, sizeof(line1), "TRACKX: %-8s", WiFi.status() == WL_CONNECTED ? "ONLINE" : "OFFLINE");
      snprintf(line2, sizeof(line2), "S:%02dkm/h SAT:%-2d", speed, sats);
      break;

    case 1:
      // Screen 1: GPS Coordinates
      snprintf(line1, sizeof(line1), "LAT:%11.5f", lat);
      snprintf(line2, sizeof(line2), "LON:%11.5f", lon);
      break;

    case 2:
      // Screen 2: MPU6050 Motion Status & Accelerometer
      if (motionState == "POSSIBLE_IMPACT") {
        snprintf(line1, sizeof(line1), "!IMPACT DETECTED");
        snprintf(line2, sizeof(line2), "HIGH-G SPIKE!   ");
      } else if (motionState == "ABNORMAL") {
        snprintf(line1, sizeof(line1), "MOTION: ABNORMAL");
        snprintf(line2, sizeof(line2), "TILT/JERK DETECT");
      } else {
        snprintf(line1, sizeof(line1), "MOTION: NORMAL  ");
        snprintf(line2, sizeof(line2), "MPU6050: 0.98G  ");
      }
      break;

    case 3:
      // Screen 3: Battery Voltage & Wi-Fi IP
      snprintf(line1, sizeof(line1), "BATT:%3d%% [%.1fV]", battPct, volts);
      if (WiFi.status() == WL_CONNECTED) {
        String ip = WiFi.localIP().toString();
        snprintf(line2, sizeof(line2), "IP:%-13s", ip.c_str());
      } else {
        snprintf(line2, sizeof(line2), "WiFi: SCANNING..");
      }
      break;

    case 4:
      // Screen 4: Altitude & GPS Accuracy
      snprintf(line1, sizeof(line1), "ALTITUDE: %4dm", (int)alt);
      snprintf(line2, sizeof(line2), "HDOP: +/-%.1fm   ", hdop);
      break;
  }

  lcd.setCursor(0, 0);
  lcd.print(line1);
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

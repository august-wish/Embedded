/* Includes ---------------------------------------------------------------- */
#include <Embed_inferencing.h>
#include "edge-impulse-sdk/dsp/image/image.hpp"
#include "esp_camera.h"
#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <TinyGPSPlus.h>
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"

// ================= ตั้งค่า Wi-Fi และ Discord =================
const char* ssid = "PeakordRoRr5r5r5";
const char* password = "Pongsinachai";
const char* discord_webhook = "https://discord.com/api/webhooks/1572973246255468644/7I2XJk7HUTEQhmL0YWnaUDNqotpR3kPYKesVA_8Esr4-Qpx0BvEVNMwk353F-QX1w69W";
// ===========================================================

Servo myServo;
TinyGPSPlus gps;
MAX30105 particleSensor;

#define SERVO_PIN 2     // ขา Servo SG90
#define SOS_PIN   13    // ขาปุ่ม SOS
#define SDA_PIN   14    // ขา SDA ของ MAX30102
#define SCL_PIN   15    // ขา SCL ของ MAX30102

// ตัวแปรหน่วงเวลาส่ง Discord
unsigned long lastAlertTime = 0;
const unsigned long alertCooldown = 5000;

unsigned long lastSosTime = 0;
const unsigned long sosCooldown = 3000;

unsigned long lastHrAlertTime = 0;
const unsigned long hrAlertCooldown = 15000; // เว้นระยะแจ้งเตือนชีพจรผิดปกติทุก 15 วิ

// ตัวแปรวัดชีพจร (ทำงานบน Core 0)
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
volatile int beatAvg = 0;
volatile int validBeats = 0;
volatile bool fingerDetected = false;
bool max30102Ready = false;

#define CAMERA_MODEL_AI_THINKER // Has PSRAM

#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

/* Constant defines -------------------------------------------------------- */
#define EI_CAMERA_RAW_FRAME_BUFFER_COLS           320
#define EI_CAMERA_RAW_FRAME_BUFFER_ROWS           240
#define EI_CAMERA_FRAME_BYTE_SIZE                 3

/* Private variables ------------------------------------------------------- */
static bool debug_nn = false;
static bool is_initialised = false;
uint8_t *snapshot_buf;

static camera_config_t camera_config = {
    .pin_pwdn = PWDN_GPIO_NUM,
    .pin_reset = RESET_GPIO_NUM,
    .pin_xclk = XCLK_GPIO_NUM,
    .pin_sscb_sda = SIOD_GPIO_NUM,
    .pin_sscb_scl = SIOC_GPIO_NUM,
    .pin_d7 = Y9_GPIO_NUM,
    .pin_d6 = Y8_GPIO_NUM,
    .pin_d5 = Y7_GPIO_NUM,
    .pin_d4 = Y6_GPIO_NUM,
    .pin_d3 = Y5_GPIO_NUM,
    .pin_d2 = Y4_GPIO_NUM,
    .pin_d1 = Y3_GPIO_NUM,
    .pin_d0 = Y2_GPIO_NUM,
    .pin_vsync = VSYNC_GPIO_NUM,
    .pin_href = HREF_GPIO_NUM,
    .pin_pclk = PCLK_GPIO_NUM,
    .xclk_freq_hz = 20000000,
    .ledc_timer = LEDC_TIMER_0,
    .ledc_channel = LEDC_CHANNEL_0,
    .pixel_format = PIXFORMAT_JPEG,
    .frame_size = FRAMESIZE_QVGA,
    .jpeg_quality = 12,
    .fb_count = 1,
    .fb_location = CAMERA_FB_IN_PSRAM,
    .grab_mode = CAMERA_GRAB_WHEN_EMPTY,
};

/* Function definitions ------------------------------------------------------- */
bool ei_camera_init(void);
void ei_camera_deinit(void);
bool ei_camera_capture(uint32_t img_width, uint32_t img_height, uint8_t *out_buf);
void sendDiscord(String message);
void readGPS();

// งานวัดชีพจรแยกไปรันบน Core 0 เพื่อไม่ให้ชนกับ AI
void heartRateTask(void *pvParameters) {
    while (true) {
        if (max30102Ready) {
            long irValue = particleSensor.getIR();
            if (irValue < 50000) {
                fingerDetected = false;
                beatAvg = 0;
                validBeats = 0;
            } else {
                fingerDetected = true;
                if (checkForBeat(irValue) == true) {
                    long delta = millis() - lastBeat;
                    lastBeat = millis();

                    float beatsPerMinute = 60.0 / (delta / 1000.0);
                    if (beatsPerMinute < 200 && beatsPerMinute > 40) {
                        rates[rateSpot++] = (byte)beatsPerMinute;
                        rateSpot %= RATE_SIZE;

                        if (validBeats < RATE_SIZE) validBeats++;
                        int total = 0;
                        for (byte x = 0; x < validBeats; x++) {
                            total += rates[x];
                        }
                        beatAvg = total / validBeats;
                    }
                }
            }
        }
        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void setup()
{
    Serial.begin(9600); // รับข้อมูล GPS ผ่านขา U0R

    pinMode(SOS_PIN, INPUT_PULLUP);

    if (ei_camera_init() == false) {
        ei_printf("Failed to initialize Camera!\r\n");
    }

    ESP32PWM::allocateTimer(1);
    myServo.setPeriodHertz(50);
    myServo.attach(SERVO_PIN, 500, 2400);
    myServo.write(0);

    // เริ่มต้นเซนเซอร์ MAX30102 บน Wire1 (IO14, IO15) เพื่อไม่ให้ตีกับกล้อง
    Wire1.begin(SDA_PIN, SCL_PIN);
    if (particleSensor.begin(Wire1, I2C_SPEED_STANDARD)) {
        particleSensor.setup();
        particleSensor.setPulseAmplitudeRed(0x0A); // เปิดไฟสีแดงอ่อนๆ ให้รู้ว่าทำงาน
        particleSensor.setPulseAmplitudeGreen(0);
        max30102Ready = true;
        xTaskCreatePinnedToCore(heartRateTask, "HeartRateTask", 4096, NULL, 1, NULL, 0);
    }

    WiFi.begin(ssid, password);
    int retry = 0;
    while (WiFi.status() != WL_CONNECTED && retry < 20) {
        delay(500);
        retry++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        if (max30102Ready) {
            sendDiscord("✅ ระบบ ESP32-CAM + GPS + วัดชีพจร (MAX30102) พร้อมทำงานแล้ว!");
        } else {
            sendDiscord("⚠️ ระบบพร้อมทำงาน แต่ไม่พบเซนเซอร์ MAX30102 (เช็กสาย IO14/IO15)");
        }
    }

    ei_sleep(1000);
}

void loop()
{
    readGPS();

    // 1. เช็กปุ่ม SOS (ส่งทั้งพิกัด GPS + ค่าชีพจรล่าสุด)
    if (digitalRead(SOS_PIN) == LOW && (millis() - lastSosTime > sosCooldown)) {
        lastSosTime = millis();
        String sosMsg = "🚨 **SOS ฉุกเฉิน!** ผู้ใช้งานกดปุ่มขอความช่วยเหลือ!\\n";

        if (fingerDetected && beatAvg > 0) {
            sosMsg += "❤️ ชีพจร: **" + String(beatAvg) + " BPM**\\n";
        } else {
            sosMsg += "❤️ ชีพจร: ไม่ได้วางนิ้วบนเซนเซอร์\\n";
        }

        if (gps.location.isValid()) {
            String lat = String(gps.location.lat(), 6);
            String lng = String(gps.location.lng(), 6);
            sosMsg += "📍 พิกัด: https://www.google.com/maps?q=" + lat + "," + lng;
        } else {
            sosMsg += "📍 พิกัด: กำลังค้นหาสัญญาณดาวเทียม (อยู่ในอาคาร)";
        }
        sendDiscord(sosMsg);
    }

    // 2. แจ้งเตือนอัตโนมัติถ้าชีพจรผิดปกติ (> 120 หรือ < 50 BPM)
    if (fingerDetected && validBeats >= RATE_SIZE && (beatAvg > 120 || beatAvg < 50)) {
        if (millis() - lastHrAlertTime > hrAlertCooldown) {
            lastHrAlertTime = millis();
            String hrMsg = "❤️‍🔥 **แจ้งเตือนชีพจรผิดปกติ!** วัดได้ **" + String(beatAvg) + " BPM**";
            if (gps.location.isValid()) {
                hrMsg += "\\n📍 พิกัด: https://www.google.com/maps?q=" + String(gps.location.lat(), 6) + "," + String(gps.location.lng(), 6);
            }
            sendDiscord(hrMsg);
        }
    }

    if (ei_sleep(5) != EI_IMPULSE_OK) {
        return;
    }

    // 3. จับภาพและรัน AI
    snapshot_buf = (uint8_t*)malloc(EI_CAMERA_RAW_FRAME_BUFFER_COLS * EI_CAMERA_RAW_FRAME_BUFFER_ROWS * EI_CAMERA_FRAME_BYTE_SIZE);
    if (snapshot_buf == nullptr) {
        return;
    }

    ei::signal_t signal;
    signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
    signal.get_data = &ei_camera_get_data;

    if (ei_camera_capture((size_t)EI_CLASSIFIER_INPUT_WIDTH, (size_t)EI_CLASSIFIER_INPUT_HEIGHT, snapshot_buf) == false) {
        free(snapshot_buf);
        return;
    }

    ei_impulse_result_t result = { 0 };
    EI_IMPULSE_ERROR err = run_classifier(&signal, &result, debug_nn);
    if (err != EI_IMPULSE_OK) {
        free(snapshot_buf);
        return;
    }

    bool detected = false;
    String detectedLabel = "";
    float detectedScore = 0;

#if EI_CLASSIFIER_OBJECT_DETECTION == 1
    for (uint32_t i = 0; i < result.bounding_boxes_count; i++) {
        ei_impulse_result_bounding_box_t bb = result.bounding_boxes[i];
        if (bb.value == 0) continue;

        if (bb.value > 0.5) {
            detected = true;
            detectedLabel = String(bb.label);
            detectedScore = bb.value * 100.0;
        }
    }
#endif

    free(snapshot_buf);
    readGPS();

    // 4. สั่ง Servo และส่ง Discord เมื่อเจอวัตถุ
    if (detected) {
        myServo.write(90);
        delay(500);
        myServo.write(0);

        if (millis() - lastAlertTime > alertCooldown) {
            lastAlertTime = millis();
            String msg = "⚠️ ตรวจพบสิ่งกีดขวาง: **" + detectedLabel + "** (ความมั่นใจ " + String(detectedScore, 1) + "%)";
            sendDiscord(msg);
        }
    }
}

void readGPS() {
    while (Serial.available() > 0) {
        gps.encode(Serial.read());
    }
}

void sendDiscord(String message) {
    if (WiFi.status() != WL_CONNECTED) return;

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    if (http.begin(client, discord_webhook)) {
        http.addHeader("Content-Type", "application/json");
        String payload = "{\"content\":\"" + message + "\"}";
        http.POST(payload);
        http.end();
    }
}

bool ei_camera_init(void) {
    if (is_initialised) return true;
    esp_err_t err = esp_camera_init(&camera_config);
    if (err != ESP_OK) return false;
    sensor_t * s = esp_camera_sensor_get();
    if (s->id.PID == OV3660_PID) {
      s->set_vflip(s, 1);
      s->set_brightness(s, 1);
      s->set_saturation(s, 0);
    }
    is_initialised = true;
    return true;
}

void ei_camera_deinit(void) {
    esp_camera_deinit();
    is_initialised = false;
}

bool ei_camera_capture(uint32_t img_width, uint32_t img_height, uint8_t *out_buf) {
    if (!is_initialised) return false;
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return false;

    bool converted = fmt2rgb888(fb->buf, fb->len, PIXFORMAT_JPEG, snapshot_buf);
    esp_camera_fb_return(fb);
    if (!converted) return false;

    if ((img_width != EI_CAMERA_RAW_FRAME_BUFFER_COLS) || (img_height != EI_CAMERA_RAW_FRAME_BUFFER_ROWS)) {
        ei::image::processing::crop_and_interpolate_rgb888(
            out_buf, EI_CAMERA_RAW_FRAME_BUFFER_COLS, EI_CAMERA_RAW_FRAME_BUFFER_ROWS,
            out_buf, img_width, img_height);
    }
    return true;
}

static int ei_camera_get_data(size_t offset, size_t length, float *out_ptr)
{
    size_t pixel_ix = offset * 3;
    size_t pixels_left = length;
    size_t out_ptr_ix = 0;

    while (pixels_left != 0) {
        out_ptr[out_ptr_ix] = (snapshot_buf[pixel_ix + 2] << 16) + (snapshot_buf[pixel_ix + 1] << 8) + snapshot_buf[pixel_ix];
        out_ptr_ix++;
        pixel_ix += 3;
        pixels_left--;
    }
    return 0;
}

#if !defined(EI_CLASSIFIER_SENSOR) || EI_CLASSIFIER_SENSOR != EI_CLASSIFIER_SENSOR_CAMERA
#error "Invalid model for current sensor"
#endif
ALTER TABLE `devices` ADD COLUMN `schema_version` text NOT NULL DEFAULT '0.1-legacy';
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `gateway_id` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `source_id` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `origin_kind` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `latest_record_id` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `source_sample_at_utc` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `gateway_received_at_utc` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `cloud_ingested_at_utc` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `heart_rate_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `light_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `gps_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `gps_fix_age_ms` integer;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `ai_model_name` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `ai_model_version` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `ai_classification` text;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `ai_confidence` real;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `ai_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `devices` ADD COLUMN `delayed_upload` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `record_id` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `schema_version` text NOT NULL DEFAULT '0.1-legacy';
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `kind` text NOT NULL DEFAULT 'telemetry';
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `gateway_id` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `source_id` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `origin_kind` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `source_boot_id` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `source_seq` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `source_sample_uptime_ms` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `source_sample_at_utc` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `gateway_received_at_utc` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `gateway_received_uptime_ms` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `cloud_ingested_at_utc` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `delayed_upload` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `hc_sr04_distance_cm` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `hc_sr04_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_accel_x_mps2` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_accel_y_mps2` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_accel_z_mps2` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_gyro_x_dps` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_gyro_y_dps` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu_gyro_z_dps` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `mpu6050_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `max30102_ir_raw` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `max30102_red_raw` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `max30102_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ldr_adc_raw` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ldr_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `gps_fix_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `gps_fix_age_ms` integer;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ai_model_name` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ai_model_version` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ai_classification` text;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ai_confidence` real;
--> statement-breakpoint
ALTER TABLE `telemetry_readings` ADD COLUMN `ai_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `event_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gateway_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `source_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `source_boot_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `origin_kind` text NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `source_sample_uptime_ms` integer;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gps_fix_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gps_fix_age_ms` integer;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `delivery_state` text NOT NULL DEFAULT 'gateway_expected';
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `cloud_ingested_at_utc` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ai_model_name` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ai_model_version` text;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ai_confidence` real;
--> statement-breakpoint
ALTER TABLE `alerts` ADD COLUMN `event_id` text;
--> statement-breakpoint
ALTER TABLE `alerts` ADD COLUMN `gps_fix_valid` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `alerts` ADD COLUMN `gps_fix_age_ms` integer;
--> statement-breakpoint
ALTER TABLE `alerts` ADD COLUMN `delivery_state` text NOT NULL DEFAULT 'gateway_expected';
--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_record_id_unique` ON `telemetry_readings` (`record_id`) WHERE `record_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_id_unique` ON `events` (`event_id`) WHERE `event_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `telemetry_source_time_idx` ON `telemetry_readings` (`device_id`,`source_id`,`cloud_ingested_at_utc`);
--> statement-breakpoint
CREATE INDEX `events_stable_time_idx` ON `events` (`device_id`,`event_id`,`occurred_at`);

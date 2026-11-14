CREATE TABLE `devices` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL DEFAULT 'Smart Cane',
  `heart_rate` integer,
  `movement` text,
  `light_lux` integer,
  `latitude` real,
  `longitude` real,
  `gps_accuracy` real,
  `fall_detected` integer NOT NULL DEFAULT 0,
  `sos_pressed` integer NOT NULL DEFAULT 0,
  `last_seen` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `telemetry_readings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `device_id` text NOT NULL,
  `heart_rate` integer,
  `movement` text,
  `light_lux` integer,
  `latitude` real,
  `longitude` real,
  `gps_accuracy` real,
  `fall_detected` integer NOT NULL DEFAULT 0,
  `sos_pressed` integer NOT NULL DEFAULT 0,
  `recorded_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `device_id` text NOT NULL,
  `event_type` text NOT NULL,
  `severity` text NOT NULL,
  `description` text NOT NULL,
  `latitude` real,
  `longitude` real,
  `occurred_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `alerts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `device_id` text NOT NULL,
  `event_type` text NOT NULL,
  `severity` text NOT NULL DEFAULT 'emergency',
  `description` text NOT NULL,
  `latitude` real,
  `longitude` real,
  `event_timestamp` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `acknowledged` integer NOT NULL DEFAULT 0,
  `acknowledged_at` text,
  `acknowledged_by` text,
  FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telemetry_device_time_idx` ON `telemetry_readings` (`device_id`,`recorded_at`);
--> statement-breakpoint
CREATE INDEX `events_device_time_idx` ON `events` (`device_id`,`occurred_at`);
--> statement-breakpoint
CREATE INDEX `alerts_device_active_idx` ON `alerts` (`device_id`,`acknowledged`,`event_timestamp`);

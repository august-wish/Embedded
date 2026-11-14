CREATE TABLE `caregivers` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL DEFAULT '',
  `full_name` text NOT NULL DEFAULT 'Caregiver',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `care_recipients` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `display_name` text NOT NULL,
  `relationship` text NOT NULL DEFAULT 'Person in care',
  `device_id` text NOT NULL UNIQUE,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `caregiver_recipients` (
  `caregiver_id` text NOT NULL,
  `recipient_id` integer NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(`caregiver_id`, `recipient_id`),
  FOREIGN KEY (`caregiver_id`) REFERENCES `caregivers`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`recipient_id`) REFERENCES `care_recipients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `caregiver_recipients_caregiver_idx` ON `caregiver_recipients` (`caregiver_id`);
--> statement-breakpoint
CREATE INDEX `care_recipients_device_idx` ON `care_recipients` (`device_id`);

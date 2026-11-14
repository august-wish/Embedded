CREATE TABLE `auth_users` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL UNIQUE,
  `full_name` text NOT NULL,
  `password_salt` text NOT NULL,
  `password_hash` text NOT NULL,
  `password_iterations` integer NOT NULL,
  `failed_login_count` integer NOT NULL DEFAULT 0,
  `locked_until` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `auth_login_limits` (
  `key` text PRIMARY KEY NOT NULL,
  `attempts` integer NOT NULL,
  `reset_at` text NOT NULL
);

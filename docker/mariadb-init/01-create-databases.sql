-- Runs once when the MariaDB container initialises an empty data directory.
-- Metadata database for Report Studio itself.
CREATE DATABASE IF NOT EXISTS report_studio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'studio'@'%' IDENTIFIED BY 'studio_pw';
GRANT ALL PRIVILEGES ON report_studio.* TO 'studio'@'%';

-- Demo business database + a read-only account for it (the account Report Studio connects with).
CREATE DATABASE IF NOT EXISTS demo_sales CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'readonly'@'%' IDENTIFIED BY 'readonly_pw';
GRANT SELECT ON demo_sales.* TO 'readonly'@'%';
FLUSH PRIVILEGES;

// Ordered list of schema migrations for the metadata database.
// Each entry runs once; the version is recorded in schema_migrations.
export const migrations: { version: number; name: string; sql: string[] }[] = [
  {
    version: 1,
    name: 'initial',
    sql: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','editor','viewer') NOT NULL DEFAULT 'editor',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS datasources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL DEFAULT 'mariadb',
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 3306,
        database_name VARCHAR(128) NOT NULL,
        username VARCHAR(128) NOT NULL,
        password_enc TEXT NOT NULL,
        use_ssl TINYINT(1) NOT NULL DEFAULT 0,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ds_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS datasets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        datasource_id INT NOT NULL,
        name VARCHAR(120) NOT NULL,
        description VARCHAR(500) NULL,
        sql_text MEDIUMTEXT NOT NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_dataset_name (datasource_id, name),
        CONSTRAINT fk_dataset_ds FOREIGN KEY (datasource_id) REFERENCES datasources(id) ON DELETE CASCADE,
        CONSTRAINT fk_dataset_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
      `CREATE TABLE IF NOT EXISTS dashboards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        description VARCHAR(500) NULL,
        definition LONGTEXT NOT NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_dash_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    ],
  },
  {
    // version 2 is taken by the ai_providers migration on the AI/i18n branch.
    version: 3,
    name: 'users_external_identity',
    sql: [
      // Accounts signed in through Microsoft Entra ID carry no password; the
      // (provider, external id) pair identifies them across logins.
      `ALTER TABLE users
        MODIFY password_hash VARCHAR(255) NULL,
        ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local' AFTER role,
        ADD COLUMN external_id VARCHAR(128) NULL AFTER auth_provider,
        ADD COLUMN email VARCHAR(255) NULL AFTER external_id,
        ADD UNIQUE KEY uq_users_external (auth_provider, external_id)`,
    ],
  },
];

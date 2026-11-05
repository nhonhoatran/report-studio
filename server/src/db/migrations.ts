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
    version: 2,
    name: 'ai_providers',
    sql: [
      `CREATE TABLE IF NOT EXISTS ai_providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        kind VARCHAR(32) NOT NULL,
        model VARCHAR(160) NOT NULL,
        base_url VARCHAR(500) NULL,
        api_key_enc TEXT NOT NULL,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    ],
  },
  {
    // version 2 is taken by the ai_providers migration above.
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
  {
    version: 4,
    name: 'user_preferences',
    sql: [
      // Superseded by version 5 (kept so databases that already recorded version 4 stay in step).
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT NULL`,
    ],
  },
  {
    version: 5,
    name: 'user_preferences_table',
    sql: [
      // One row per user with their UI look (theme mode, accent, chart palette, text size, corners).
      // The JSON bag is client-owned like dashboards.definition; the server checks shape and size.
      `CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INT PRIMARY KEY,
        prefs TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB`,
      `ALTER TABLE users DROP COLUMN IF EXISTS preferences`,
    ],
  },
  {
    version: 6,
    name: 'rbac_abac',
    sql: [
      // RBAC: a role is a named set of permissions (auth/permissions.ts); the three built-in ones are seeded
      // here and admin always holds every permission whatever this table says.
      `CREATE TABLE IF NOT EXISTS roles (
        name VARCHAR(32) PRIMARY KEY,
        label VARCHAR(80) NOT NULL,
        permissions TEXT NOT NULL,
        builtin TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB`,
      `INSERT IGNORE INTO roles (name, label, permissions, builtin) VALUES
        ('admin', 'Administrator', '["dashboards.view","dashboards.edit","dashboards.filters","datasources.view","datasources.manage","datasets.manage","ai.suggest","ai.manage","users.manage","roles.manage","policies.manage"]', 1),
        ('editor', 'Editor', '["dashboards.view","dashboards.edit","datasources.view","datasources.manage","datasets.manage","ai.suggest"]', 1),
        ('viewer', 'Viewer', '["dashboards.view"]', 1)`,
      // a user's role is now any row of roles; attributes (ABAC) are a JSON object of string lists
      `ALTER TABLE users
        MODIFY role VARCHAR(32) NOT NULL DEFAULT 'viewer',
        ADD COLUMN attributes TEXT NULL AFTER email,
        ADD CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles(name) ON UPDATE CASCADE`,
      // ABAC: who (subject JSON), what (resource JSON), which actions, allow or deny, optional row filters
      `CREATE TABLE IF NOT EXISTS access_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        effect VARCHAR(8) NOT NULL,
        subject TEXT NOT NULL,
        resource TEXT NOT NULL,
        actions TEXT NOT NULL,
        row_filters TEXT NULL,
        created_by INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_policy_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB`,
    ],
  },
];

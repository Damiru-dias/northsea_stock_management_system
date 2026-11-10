export function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS factories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      factory_code TEXT NOT NULL DEFAULT 'F'
    );
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'keeper', 'supervisor')),
      section_id INTEGER,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0, 1)),
      auth_version INTEGER NOT NULL DEFAULT 0 CHECK(auth_version >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(factory_id, role, section_id)
    );
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      section_id INTEGER,
      unit TEXT NOT NULL DEFAULT 'kg',
      is_dye INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      factory_id INTEGER REFERENCES factories(id)
    );
    CREATE TABLE IF NOT EXISTS material_sections (
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      section_id INTEGER NOT NULL REFERENCES sections(id),
      PRIMARY KEY(material_id, section_id)
    );
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      UNIQUE(factory_id, material_id)
    );
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      material_id INTEGER NOT NULL REFERENCES materials(id),
      action TEXT NOT NULL CHECK(action IN ('add', 'remove')),
      quantity REAL NOT NULL CHECK(quantity > 0),
      note TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'recorded')),
      reviewed_by INTEGER REFERENCES users(id),
      review_note TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      customer TEXT NOT NULL,
      pieces INTEGER NOT NULL CHECK(pieces > 0),
      ply INTEGER NOT NULL CHECK(ply BETWEEN 1 AND 60),
      mesh_size TEXT NOT NULL,
      width_m REAL NOT NULL CHECK(width_m > 0),
      length_m REAL NOT NULL CHECK(length_m > 0 AND length_m <= 3000),
      dye_color TEXT,
      order_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'in_production', 'completed')),
      manager_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_materials (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      quantity REAL NOT NULL CHECK(quantity > 0)
    );
    CREATE TABLE IF NOT EXISTS procurement_requests (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      material_id INTEGER NOT NULL REFERENCES materials(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      request_code TEXT,
      status TEXT NOT NULL DEFAULT 'manager_pending' CHECK(status IN ('manager_pending', 'admin_pending', 'ordered', 'received', 'rejected')),
      manager_note TEXT,
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      order_id INTEGER REFERENCES orders(id),
      material_id INTEGER NOT NULL REFERENCES materials(id),
      from_section INTEGER,
      to_section INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
      note TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1)),
      deleted_by INTEGER REFERENCES users(id),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS section_stock (
      id INTEGER PRIMARY KEY,
      factory_id INTEGER NOT NULL,
      section_id INTEGER NOT NULL,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      UNIQUE(factory_id, section_id, material_id)
    );
    CREATE TABLE IF NOT EXISTS factory_sequences (
      factory_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('order', 'request')),
      next_value INTEGER NOT NULL CHECK(next_value > 0),
      PRIMARY KEY(factory_id, entity_type)
    );
  `);
}

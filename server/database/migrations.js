export function applyMigrations(db) {
  const hasColumn = (table, name) => db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name);
  if (!hasColumn("factories", "factory_code")) {
    db.exec("ALTER TABLE factories ADD COLUMN factory_code TEXT NOT NULL DEFAULT 'F'");
  }
  db.exec(`
    UPDATE factories SET factory_code = CASE id
      WHEN 1 THEN 'L' WHEN 2 THEN 'W' WHEN 3 THEN 'J' ELSE 'F' END;
  `);

  if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "must_change_password")) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0, 1))");
  }
  if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "auth_version")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0 CHECK(auth_version >= 0)");
  }
  db.exec(`
    DELETE FROM users
    WHERE id NOT IN (
      SELECT MIN(id) FROM users
      GROUP BY role, COALESCE(factory_id, 0), COALESCE(section_id, 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_admin_account
      ON users(role) WHERE role = 'admin';
    CREATE UNIQUE INDEX IF NOT EXISTS one_factory_account_per_role
      ON users(factory_id, role)
      WHERE role IN ('manager', 'keeper') AND section_id IS NULL;
  `);
  
  if (!hasColumn("materials", "unit")) {
    db.exec("ALTER TABLE materials ADD COLUMN unit TEXT NOT NULL DEFAULT 'kg'");
  }
  if (!hasColumn("materials", "is_active")) {
    db.exec("ALTER TABLE materials ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))");
  }
  if (!hasColumn("materials", "factory_id")) {
    db.exec("ALTER TABLE materials ADD COLUMN factory_id INTEGER REFERENCES factories(id)");
  }
  for (const column of [
    { name: "order_id", sql: "ALTER TABLE transfers ADD COLUMN order_id INTEGER REFERENCES orders(id)" },
    { name: "period_start", sql: "ALTER TABLE transfers ADD COLUMN period_start TEXT NOT NULL DEFAULT '1970-01-01'" },
    { name: "period_end", sql: "ALTER TABLE transfers ADD COLUMN period_end TEXT NOT NULL DEFAULT '1970-01-01'" },
    { name: "is_deleted", sql: "ALTER TABLE transfers ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0, 1))" },
    { name: "deleted_by", sql: "ALTER TABLE transfers ADD COLUMN deleted_by INTEGER REFERENCES users(id)" },
    { name: "deleted_at", sql: "ALTER TABLE transfers ADD COLUMN deleted_at TEXT" },
  ]) {
    if (!hasColumn("transfers", column.name)) db.exec(column.sql);
  }
  db.exec(`
    UPDATE transfers
    SET period_start = substr(created_at, 1, 10), period_end = substr(created_at, 1, 10)
    WHERE period_start = '1970-01-01' OR period_end = '1970-01-01';
  `);
  
  const procurementSchema = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'procurement_requests'",
  ).get().sql;
  if (!procurementSchema.includes("'awaiting_receipt'")) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE procurement_requests_updated (
          id INTEGER PRIMARY KEY,
          factory_id INTEGER NOT NULL,
          created_by INTEGER NOT NULL REFERENCES users(id),
          material_id INTEGER NOT NULL REFERENCES materials(id),
          quantity REAL NOT NULL CHECK(quantity > 0),
          status TEXT NOT NULL DEFAULT 'manager_pending'
            CHECK(status IN ('manager_pending', 'admin_pending', 'ordered', 'awaiting_receipt', 'received', 'rejected')),
          manager_note TEXT,
          admin_note TEXT,
          received_quantity REAL,
          receipt_note TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO procurement_requests_updated
          (id, factory_id, created_by, material_id, quantity, status, manager_note, admin_note, created_at)
        SELECT id, factory_id, created_by, material_id, quantity, status, manager_note, admin_note, created_at
        FROM procurement_requests;
        DROP TABLE procurement_requests;
        ALTER TABLE procurement_requests_updated RENAME TO procurement_requests;
      `);
    })();
  }
  for (const column of [
    { name: "received_quantity", sql: "ALTER TABLE procurement_requests ADD COLUMN received_quantity REAL" },
    { name: "receipt_note", sql: "ALTER TABLE procurement_requests ADD COLUMN receipt_note TEXT" },
  ]) {
    if (!hasColumn("procurement_requests", column.name)) db.exec(column.sql);
  }

  if (!hasColumn("orders", "order_code")) {
    db.exec("ALTER TABLE orders ADD COLUMN order_code TEXT");
  }
  if (!hasColumn("procurement_requests", "request_code")) {
    db.exec("ALTER TABLE procurement_requests ADD COLUMN request_code TEXT");
  }
  for (const [table, column, entityType, prefix] of [
    ["orders", "order_code", "order", "ORD"],
    ["procurement_requests", "request_code", "request", "REQ"],
  ]) {
    const rows = db.prepare(`SELECT id, factory_id, ${column} AS code FROM ${table} ORDER BY factory_id, id`).all();
    const counts = new Map();
    const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
    for (const row of rows) {
      let sequence = counts.get(row.factory_id) || 0;
      if (!row.code) {
        sequence += 1;
        const factoryCode = db.prepare("SELECT factory_code FROM factories WHERE id = ?").get(row.factory_id)?.factory_code || "F";
        update.run(`${prefix}-${factoryCode}${String(sequence).padStart(4, "0")}`, row.id);
      } else {
        sequence = Math.max(sequence, Number(row.code.match(/(\d+)$/)?.[1]) || 0);
      }
      counts.set(row.factory_id, sequence);
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_${column}_unique ON ${table}(${column})`);
    const saveSequence = db.prepare(`
      INSERT INTO factory_sequences (factory_id, entity_type, next_value) VALUES (?, ?, ?)
      ON CONFLICT(factory_id, entity_type) DO UPDATE SET next_value = MAX(next_value, excluded.next_value)
    `);
    for (const [factoryId, count] of counts) saveSequence.run(factoryId, entityType, count + 1);
  }
}

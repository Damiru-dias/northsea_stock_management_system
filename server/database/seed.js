import bcrypt from "bcryptjs";

export const factories = [
  { id: 1, name: "Lunuwila", location: "Sri Lanka", code: "L" },
  { id: 2, name: "Weerawila", location: "Sri Lanka", code: "W" },
  { id: 3, name: "Jaffna", location: "Sri Lanka", code: "J" },
];

export const sections = [
  { id: 1, name: "Netting" },
  { id: 2, name: "Mending" },
  { id: 3, name: "Depth Stretching" },
  { id: 4, name: "Dye" },
  { id: 5, name: "Length Section" },
  { id: 6, name: "Packing" },
];

export function seedDatabase(db) {
  const saveFactory = db.prepare(`
    INSERT INTO factories (id, name, location, factory_code) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, location = excluded.location, factory_code = excluded.factory_code
  `);
  for (const factory of factories) {
    saveFactory.run(factory.id, factory.name, factory.location, factory.code);
  }
  
  const insertSection = db.prepare("INSERT OR IGNORE INTO sections (id, name) VALUES (?, ?)");
  for (const section of sections) insertSection.run(section.id, section.name);
  
  const materialSeeds = [
    ["Nylon yarn 210", "Nylon yarn", 1, 0],
    ["Nylon yarn 420", "Nylon yarn", 1, 0],
    ["Nylon yarn Twin", "Nylon yarn", 2, 0],
    ["Polythen", "Packaging", 6, 0],
    ["Dye", "Dye", 4, 1],
  ];
  const insertMaterial = db.prepare(
    "INSERT OR IGNORE INTO materials (name, category, section_id, is_dye) VALUES (?, ?, ?, ?)",
  );
  for (const material of materialSeeds) insertMaterial.run(...material);
  db.exec(`
    INSERT OR IGNORE INTO material_sections (material_id, section_id)
    SELECT id, section_id FROM materials WHERE section_id IS NOT NULL;
  `);
  
  const defaultPasswordHash = bcrypt.hashSync("ChangeMe123!", 10);
  const insertUser = db.prepare(
    "INSERT OR IGNORE INTO users (factory_id, role, section_id, display_name, password_hash) VALUES (?, ?, ?, ?, ?)",
  );
  const renameDefaultAccount = db.prepare("UPDATE users SET display_name = ? WHERE factory_id = ? AND role = ? AND section_id IS ? AND display_name = ?");
  const legacyFactoryNames = ["Factory 01", "Factory 02", "Factory 03"];
  for (const factory of factories) {
    const legacyName = legacyFactoryNames[factory.id - 1];
    renameDefaultAccount.run(`${factory.name} Manager`, factory.id, "manager", null, `${legacyName} Manager`);
    renameDefaultAccount.run(`${factory.name} Stock Keeper`, factory.id, "keeper", null, `${legacyName} Stock Keeper`);
    for (const section of sections) {
      renameDefaultAccount.run(`${factory.name} ${section.name} Supervisor`, factory.id, "supervisor", section.id, `${legacyName} ${section.name} Supervisor`);
    }
  }
  if (!db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()) {
    insertUser.run(null, "admin", null, "System Administrator", defaultPasswordHash);
  }
  for (const factory of factories) {
    insertUser.run(factory.id, "manager", null, `${factory.name} Manager`, defaultPasswordHash);
    insertUser.run(factory.id, "keeper", null, `${factory.name} Stock Keeper`, defaultPasswordHash);
    for (const section of sections) {
      insertUser.run(factory.id, "supervisor", section.id, `${factory.name} ${section.name} Supervisor`, defaultPasswordHash);
    }
  }
  
  const initialStock = db.prepare(
    "INSERT OR IGNORE INTO stock (factory_id, material_id, quantity) SELECT ?, id, 0 FROM materials WHERE factory_id IS NULL OR factory_id = ?",
  );
  for (const factory of factories) initialStock.run(factory.id, factory.id);
}

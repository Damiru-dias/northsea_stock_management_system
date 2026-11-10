export function registerMaterialsRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/materials", authenticate, (_req, res) => {
  const isSupervisor = _req.user.role === "supervisor";
  const factoryId = scopedFactory(_req);
  const materials = isSupervisor ? db.prepare(`
    SELECT m.* FROM materials m
    WHERE (m.factory_id IS NULL OR m.factory_id = ?) AND EXISTS (
      SELECT 1 FROM section_stock ss
      WHERE ss.factory_id = ? AND ss.section_id = ? AND ss.material_id = m.id AND ss.quantity > 0
    )
    ORDER BY m.id
  `).all(factoryId, factoryId, _req.user.section_id) : db.prepare(`
    SELECT * FROM materials WHERE factory_id IS NULL OR factory_id = ? ORDER BY id
  `).all(factoryId);
  const allocations = db.prepare(`
    SELECT ms.material_id AS materialId, s.id AS sectionId, s.name AS sectionName
    FROM material_sections ms JOIN sections s ON s.id = ms.section_id
    ${isSupervisor ? "WHERE ms.section_id = ?" : ""}
    ORDER BY s.id
  `).all(...(isSupervisor ? [_req.user.section_id] : []));
  res.json(materials.map((material) => {
    const assignedSections = allocations.filter((allocation) => allocation.materialId === material.id);
    return {
      ...material,
      isActive: Boolean(material.is_active),
      unitEditable: !materialHasHistory(material.id),
      sectionIds: assignedSections.map((section) => section.sectionId),
      sectionNames: assignedSections.map((section) => section.sectionName),
      assignedSections,
    };
  }));
});
app.post("/api/materials", authenticate, requireRole("admin", "keeper"), (req, res) => {
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "").trim();
  const unit = String(req.body.unit || "");
  const rawSectionIds = Array.isArray(req.body.sectionIds) ? req.body.sectionIds : [req.body.sectionId];
  const sectionIds = [...new Set(rawSectionIds.map(Number))];
  if (name.length < 2 || name.length > 80 || !category || category.length > 50 ||
      !["kg", "pcs", "liter"].includes(unit) ||
      !sectionIds.length || sectionIds.some((sectionId) => !sections.some((section) => section.id === sectionId))) {
    return fail(res, 400, "Enter a material name, category, valid unit and at least one allocated section.");
  }
  if (db.prepare("SELECT id FROM materials WHERE name = ? COLLATE NOCASE").get(name)) {
    return fail(res, 409, "A material with that name already exists.");
  }
  const materialFactoryId = req.user.role === "keeper" ? req.user.factory_id : null;
  const create = db.transaction(() => {
    const result = db.prepare(
      "INSERT INTO materials (name, category, section_id, unit, is_dye, factory_id) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(name, category, sectionIds[0], unit, Number(category.toLowerCase() === "dye"), materialFactoryId);
    const insertAllocation = db.prepare("INSERT INTO material_sections (material_id, section_id) VALUES (?, ?)");
    for (const sectionId of sectionIds) insertAllocation.run(result.lastInsertRowid, sectionId);
    const stockFactories = materialFactoryId === null
      ? factories
      : factories.filter((factory) => factory.id === materialFactoryId);
    for (const factory of stockFactories) {
      db.prepare("INSERT INTO stock (factory_id, material_id, quantity) VALUES (?, ?, 0)")
        .run(factory.id, result.lastInsertRowid);
    }
    return result.lastInsertRowid;
  });
  try {
    const id = create();
    res.status(201).json({
      id,
      message: materialFactoryId === null
        ? "Material added to the shared catalog and allocated to its selected sections."
        : "Material added to your factory and allocated to its selected sections.",
    });
  } catch (error) {
    if (error.errcode === 2067) return fail(res, 409, "A material with that name already exists.");
    throw error;
  }
});
const materialHasHistory = (materialId) => Boolean(
  db.prepare("SELECT 1 FROM stock WHERE material_id = ? AND quantity > 0 LIMIT 1").get(materialId) ||
  db.prepare("SELECT 1 FROM section_stock WHERE material_id = ? LIMIT 1").get(materialId) ||
  db.prepare("SELECT 1 FROM order_materials WHERE material_id = ? LIMIT 1").get(materialId) ||
  db.prepare("SELECT 1 FROM procurement_requests WHERE material_id = ? LIMIT 1").get(materialId) ||
  db.prepare("SELECT 1 FROM transfers WHERE material_id = ? LIMIT 1").get(materialId) ||
  db.prepare("SELECT 1 FROM stock_adjustments WHERE material_id = ? LIMIT 1").get(materialId)
);
app.patch("/api/materials/:id", authenticate, requireRole("admin"), (req, res) => {
  const materialId = Number(req.params.id);
  const material = db.prepare("SELECT * FROM materials WHERE id = ? AND is_active = 1").get(materialId);
  if (!material) return fail(res, 404, "Material not found.");
  if (!material.is_active) return fail(res, 409, "Archived materials cannot be edited.");
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "").trim();
  const unit = String(req.body.unit || "");
  const sectionIds = [...new Set((Array.isArray(req.body.sectionIds) ? req.body.sectionIds : []).map(Number))];
  if (name.length < 2 || name.length > 80 || !category || category.length > 50 ||
      !["kg", "pcs", "liter"].includes(unit) || !sectionIds.length ||
      sectionIds.some((sectionId) => !sections.some((section) => section.id === sectionId))) {
    return fail(res, 400, "Enter a material name, category, valid unit and at least one allocated section.");
  }
  if (db.prepare("SELECT id FROM materials WHERE name = ? COLLATE NOCASE AND id != ?").get(name, materialId)) {
    return fail(res, 409, "A material with that name already exists.");
  }
  db.transaction(() => {
    db.prepare(`
      UPDATE materials SET name = ?, category = ?, section_id = ?, unit = ?, is_dye = ?
      WHERE id = ?
    `).run(name, category, sectionIds[0], unit, Number(category.toLowerCase() === "dye"), materialId);
    db.prepare("DELETE FROM material_sections WHERE material_id = ?").run(materialId);
    const insertAllocation = db.prepare("INSERT INTO material_sections (material_id, section_id) VALUES (?, ?)");
    for (const sectionId of sectionIds) insertAllocation.run(materialId, sectionId);
  })();
  res.json({ message: "Material details updated." });
});
app.delete("/api/materials/:id", authenticate, requireRole("admin"), (req, res) => {
  const materialId = Number(req.params.id);
  const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId);
  if (!material) return fail(res, 404, "Material not found.");
  if (!material.is_active) return fail(res, 409, "This material is already archived.");
  const hasHistory = materialHasHistory(materialId);
  if (hasHistory) {
    db.prepare("UPDATE materials SET is_active = 0 WHERE id = ?").run(materialId);
    return res.json({ message: "Material archived. Existing stock and history are preserved." });
  }
  db.transaction(() => {
    db.prepare("DELETE FROM stock WHERE material_id = ?").run(materialId);
    db.prepare("DELETE FROM section_stock WHERE material_id = ?").run(materialId);
    db.prepare("DELETE FROM materials WHERE id = ?").run(materialId);
  })();
  res.json({ message: "Unused material deleted." });
});
}

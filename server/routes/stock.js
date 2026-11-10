export function registerStockRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/stock", authenticate, (req, res) => {
  const factoryId = scopedFactory(req);
  const sectionFilter = req.user.role === "supervisor" ? "AND ss.section_id = ?" : "";
  const stock = db.prepare(`
    SELECT s.id, s.factory_id AS factoryId, s.quantity, m.id AS materialId, m.name, m.name AS material, m.category, m.unit,
      m.is_active AS isActive,
      m.section_id AS sectionId, sec.name AS sectionName
    FROM stock s JOIN materials m ON m.id = s.material_id
    LEFT JOIN sections sec ON sec.id = m.section_id
    WHERE s.factory_id = ? AND (m.factory_id IS NULL OR m.factory_id = s.factory_id) ORDER BY m.id
  `).all(factoryId);
  const sectionStock = db.prepare(`
    SELECT ss.section_id AS sectionId, sec.name AS sectionName, ss.material_id AS materialId,
      m.name AS material, ss.quantity, m.unit
    FROM section_stock ss JOIN materials m ON m.id = ss.material_id
    JOIN sections sec ON sec.id = ss.section_id
    WHERE ss.factory_id = ? AND (m.factory_id IS NULL OR m.factory_id = ss.factory_id) ${sectionFilter}
    ORDER BY sec.id, m.id
  `).all(...(req.user.role === "supervisor" ? [factoryId, req.user.section_id] : [factoryId]));
  const allocations = db.prepare(`
    SELECT ms.material_id AS materialId, s.id AS sectionId, s.name AS sectionName
    FROM material_sections ms JOIN sections s ON s.id = ms.section_id ORDER BY s.id
  `).all();
  const stockWithAllocations = stock.map((item) => {
    const assignedSections = allocations.filter((allocation) => allocation.materialId === item.materialId);
    return {
      ...item,
      isActive: Boolean(item.isActive),
      assignedSections,
      sectionIds: assignedSections.map((section) => section.sectionId),
      sectionNames: assignedSections.map((section) => section.sectionName),
    };
  });
  res.json({ stock: req.user.role === "supervisor" ? [] : stockWithAllocations, sectionStock });
});

app.get("/api/stock-adjustments", authenticate, requireRole("keeper", "manager", "admin"), (req, res) => {
  const factoryId = scopedFactory(req);
  res.json(db.prepare(`
    SELECT a.*, m.name AS material, m.unit, creator.display_name AS requested_by,
      reviewer.display_name AS reviewed_by_name
    FROM stock_adjustments a
    JOIN materials m ON m.id = a.material_id
    JOIN users creator ON creator.id = a.created_by
    LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
    WHERE a.factory_id = ? ORDER BY a.created_at DESC, a.id DESC
  `).all(factoryId));
});

app.post("/api/stock-adjustments", authenticate, requireRole("keeper"), (req, res) => {
  const materialId = Number(req.body.materialId);
  const action = req.body.action;
  const quantity = Number(req.body.quantity);
  const note = String(req.body.note || "").trim();
  if (!Number.isInteger(materialId) || !["add", "remove"].includes(action) || !Number.isFinite(quantity) || quantity <= 0) {
    return fail(res, 400, "Choose a material and enter a valid quantity and stock action.");
  }
  if (note.length > 500) return fail(res, 400, "The note must be 500 characters or fewer.");
  if (!db.prepare("SELECT id FROM materials WHERE id = ? AND is_active = 1 AND (factory_id IS NULL OR factory_id = ?)")
    .get(materialId, req.user.factory_id)) return fail(res, 400, "Choose an active material from your factory.");
  if (action === "remove") {
    const result = db.prepare(`
      INSERT INTO stock_adjustments (factory_id, created_by, material_id, action, quantity, note, status)
      VALUES (?, ?, ?, 'remove', ?, ?, 'pending')
    `).run(req.user.factory_id, req.user.id, materialId, quantity, note || null);
    return res.status(201).json({ id: result.lastInsertRowid, message: "Stock removal request sent to your factory manager." });
  }
  const recordAddition = db.transaction(() => {
    const updated = db.prepare("UPDATE stock SET quantity = quantity + ? WHERE factory_id = ? AND material_id = ?")
      .run(quantity, req.user.factory_id, materialId);
    if (!updated.changes) return null;
    const result = db.prepare(`
      INSERT INTO stock_adjustments (factory_id, created_by, material_id, action, quantity, note, status)
      VALUES (?, ?, ?, 'add', ?, ?, 'recorded')
    `).run(req.user.factory_id, req.user.id, materialId, quantity, note || null);
    return result.lastInsertRowid;
  });
  const id = recordAddition();
  if (!id) return fail(res, 404, "This material is not allocated to your factory.");
  res.status(201).json({ id, message: "Stock quantity added immediately." });
});

app.patch("/api/stock-adjustments/:id/review", authenticate, requireRole("manager"), (req, res) => {
  const adjustment = db.prepare(`
    SELECT * FROM stock_adjustments WHERE id = ? AND factory_id = ? AND action = 'remove' AND status = 'pending'
  `).get(req.params.id, req.user.factory_id);
  if (!adjustment) return fail(res, 404, "Pending stock removal request not found.");
  const decision = req.body.decision;
  const note = String(req.body.note || "").trim();
  if (!["approved", "rejected"].includes(decision)) return fail(res, 400, "Choose approve or reject.");
  if (decision === "rejected" && !note) return fail(res, 400, "A reason is required when rejecting a stock removal.");
  if (note.length > 500) return fail(res, 400, "The review note must be 500 characters or fewer.");
  const review = db.transaction(() => {
    if (decision === "approved") {
      const updatedStock = db.prepare(`
        UPDATE stock SET quantity = quantity - ?
        WHERE factory_id = ? AND material_id = ? AND quantity >= ?
      `).run(adjustment.quantity, adjustment.factory_id, adjustment.material_id, adjustment.quantity);
      if (!updatedStock.changes) return "insufficient";
    }
    const updatedRequest = db.prepare(`
      UPDATE stock_adjustments SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(decision, req.user.id, note || null, adjustment.id);
    if (!updatedRequest.changes) return "reviewed";
    return "ok";
  });
  const result = review();
  if (result === "insufficient") return fail(res, 409, "There is not enough factory stock to approve this removal.");
  if (result === "reviewed") return fail(res, 409, "This stock removal request has already been reviewed.");
  res.json({ message: `Stock removal ${decision}.` });
});
}

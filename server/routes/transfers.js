export function registerTransfersRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.post("/api/transfers", authenticate, requireRole("keeper", "supervisor"), (req, res) => {
  const { materialId, orderId, toSection, quantity, fromSection = null } = req.body;
  const linkedOrderId = orderId == null || orderId === "" ? null : Number(orderId);
  const material = db.prepare(`
    SELECT * FROM materials
    WHERE id = ? AND is_active = 1 AND (factory_id IS NULL OR factory_id = ?)
  `).get(Number(materialId), req.user.factory_id);
  const destination = Number(toSection);
  const source = fromSection == null || fromSection === "" ? null : Number(fromSection);
  const returnsToKeeper = req.user.role === "supervisor" && req.user.section_id === sections.length && destination === 0;
  const amount = Number(quantity);
  const periodStart = String(req.body.periodStart || "");
  const periodEnd = String(req.body.periodEnd || "");
  const isValidDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  };
  if (!material || (!sections.some((section) => section.id === destination) && !returnsToKeeper) || !Number.isFinite(amount) || amount <= 0) return fail(res, 400, "Choose a valid material, section and quantity.");
  if (!isValidDate(periodStart) || !isValidDate(periodEnd) || periodStart > periodEnd) return fail(res, 400, "Enter a valid work period with an end date on or after the start date.");
  if (req.user.role === "keeper" && source !== null) return fail(res, 400, "Stock keepers can issue material only from factory stock.");
  if (linkedOrderId !== null && !Number.isInteger(linkedOrderId)) return fail(res, 400, "Choose a valid order.");
  if (req.user.role === "supervisor" && linkedOrderId === null) return fail(res, 400, "Choose an order from your factory.");
  if (linkedOrderId !== null) {
    const order = db.prepare("SELECT id, status FROM orders WHERE id = ? AND factory_id = ?").get(linkedOrderId, req.user.factory_id);
    if (!order) return fail(res, 400, "Choose an order from your factory.");
    if (!["approved", "in_production"].includes(order.status)) {
      return fail(res, 400, "The order must be approved before materials can be transferred.");
    }
    const orderedMaterial = db.prepare("SELECT quantity FROM order_materials WHERE order_id = ? AND material_id = ?").get(order.id, material.id);
    if (!orderedMaterial) {
      return fail(res, 400, "Choose a material that was selected for this order.");
    }
    if (req.user.role === "keeper") {
      const alreadyTransferred = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) AS quantity FROM transfers
        WHERE order_id = ? AND material_id = ? AND from_section IS NULL AND status != 'rejected'
      `).get(order.id, material.id).quantity;
      const remaining = Math.max(0, orderedMaterial.quantity - alreadyTransferred);
      if (amount > remaining + 1e-9) {
        return fail(res, 400, `Transfer exceeds the remaining order quantity of ${remaining} ${material.unit}.`);
      }
    } else if (req.user.role === "supervisor") {
      const orderSectionBalance = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN to_section = ? THEN quantity ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN from_section = ? THEN quantity ELSE 0 END), 0) -
          COALESCE((
            SELECT SUM(p.quantity) FROM transfers p
            WHERE p.factory_id = ? AND p.order_id = ? AND p.material_id = ?
              AND p.from_section = ? AND p.status = 'pending' AND p.is_deleted = 0
          ), 0) AS quantity
        FROM transfers
        WHERE factory_id = ? AND order_id = ? AND material_id = ? AND status = 'accepted'
      `).get(source, source, req.user.factory_id, order.id, material.id, source, req.user.factory_id, order.id, material.id).quantity;
      if (amount > orderSectionBalance + 1e-9) {
        return fail(res, 400, `Transfer exceeds this order's available quantity in your section: ${Math.max(0, orderSectionBalance)} ${material.unit}.`);
      }
    }
  }
  if (req.user.role === "keeper" &&
      !db.prepare("SELECT 1 FROM material_sections WHERE material_id = ? AND section_id = ?").get(material.id, destination)) {
    return fail(res, 400, "This material is not allocated to the selected destination section.");
  }
  if (req.user.role === "supervisor" &&
      (source !== req.user.section_id || destination !== (req.user.section_id === sections.length ? 0 : req.user.section_id + 1))) {
    return fail(res, 403, "Supervisors can only transfer material to the next section, or from the final section back to the stock keeper.");
  }
  if (source !== null) {
    const available = db.prepare(`
      SELECT s.quantity - COALESCE((
        SELECT SUM(t.quantity) FROM transfers t
        WHERE t.factory_id = s.factory_id AND t.material_id = s.material_id
          AND t.from_section = s.section_id AND t.status = 'pending' AND t.is_deleted = 0
      ), 0) AS quantity
      FROM section_stock s WHERE s.factory_id = ? AND s.section_id = ? AND s.material_id = ?
    `).get(req.user.factory_id, source, material.id)?.quantity || 0;
    if (available < amount) return fail(res, 400, "There isn't enough material in the source section.");
  } else {
    const available = db.prepare(`
      SELECT s.quantity - COALESCE((
        SELECT SUM(t.quantity) FROM transfers t
        WHERE t.factory_id = s.factory_id AND t.material_id = s.material_id
          AND t.from_section IS NULL AND t.status = 'pending' AND t.is_deleted = 0
      ), 0) AS quantity
      FROM stock s WHERE s.factory_id = ? AND s.material_id = ?
    `).get(req.user.factory_id, material.id)?.quantity || 0;
    if (available < amount) return fail(res, 400, "There isn't enough material in factory stock.");
  }
  const result = db.prepare(`
    INSERT INTO transfers (factory_id, created_by, order_id, material_id, from_section, to_section, quantity, status, period_start, period_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(req.user.factory_id, req.user.id, linkedOrderId, material.id, source, destination, amount, periodStart, periodEnd);
  res.status(201).json({ id: result.lastInsertRowid, message: "Transfer request sent to the receiving user for confirmation." });
});
app.get("/api/transfers", authenticate, (req, res) => {
  const factoryId = scopedFactory(req);
  const sectionFilter = req.user.role === "supervisor" ? "AND (t.from_section = ? OR t.to_section = ?)" : "";
  res.json(db.prepare(`
    SELECT t.*, m.name AS material, m.unit, o.customer AS order_customer, o.order_code, u.display_name AS requested_by,
      fs.name AS from_name, ts.name AS to_name FROM transfers t
    JOIN materials m ON m.id = t.material_id JOIN users u ON u.id = t.created_by
    LEFT JOIN orders o ON o.id = t.order_id
    LEFT JOIN sections fs ON fs.id = t.from_section LEFT JOIN sections ts ON ts.id = t.to_section
    WHERE t.factory_id = ? AND t.is_deleted = 0 ${sectionFilter} ORDER BY t.created_at DESC
  `).all(...(req.user.role === "supervisor" ? [factoryId, req.user.section_id, req.user.section_id] : [factoryId])));
});
app.delete("/api/transfers/:id", authenticate, requireRole("manager", "admin"), (req, res) => {
  const transfer = db.prepare("SELECT id, factory_id FROM transfers WHERE id = ? AND is_deleted = 0").get(req.params.id);
  if (!transfer || (req.user.role === "manager" && transfer.factory_id !== req.user.factory_id)) {
    return fail(res, 404, "Transfer history record not found.");
  }
  const result = db.prepare(`
    UPDATE transfers SET is_deleted = 1, deleted_by = ?, deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_deleted = 0
  `).run(req.user.id, transfer.id);
  if (!result.changes) return fail(res, 404, "Transfer history record not found.");
  res.json({ message: "Transfer removed from history. Stock was unchanged." });
});
app.patch("/api/transfers/:id/review", authenticate, requireRole("keeper", "supervisor"), (req, res) => {
  const transfer = db.prepare("SELECT * FROM transfers WHERE id = ? AND factory_id = ? AND status = 'pending' AND is_deleted = 0")
    .get(req.params.id, req.user.factory_id);
  if (!transfer) return fail(res, 404, "Pending transfer not found.");
  const receivingKeeper = req.user.role === "keeper" && transfer.to_section === 0 && transfer.from_section === sections.length;
  const receivingSupervisor = req.user.role === "supervisor" && transfer.to_section === req.user.section_id &&
    transfer.from_section === (req.user.section_id === sections[0].id ? null : req.user.section_id - 1);
  if (!receivingKeeper && !receivingSupervisor) return fail(res, 403, "Only the user responsible for the transfer destination can review this request.");
  const decision = req.body.decision;
  if (!["accepted", "rejected"].includes(decision)) return fail(res, 400, "Choose accept or reject.");
  if (decision === "rejected" && !String(req.body.note || "").trim()) return fail(res, 400, "A reason is required when rejecting a transfer.");
  const review = db.transaction(() => {
    const pending = db.prepare("SELECT id FROM transfers WHERE id = ? AND factory_id = ? AND status = 'pending' AND is_deleted = 0")
      .get(transfer.id, req.user.factory_id);
    if (!pending) return false;
    if (decision === "accepted") {
      if (transfer.from_section === null) {
        const updatedStock = db.prepare(`
          UPDATE stock SET quantity = quantity - ?
          WHERE factory_id = ? AND material_id = ? AND quantity >= ?
        `).run(transfer.quantity, transfer.factory_id, transfer.material_id, transfer.quantity);
        if (!updatedStock.changes) return false;
      } else {
        const updatedSectionStock = db.prepare(`
          UPDATE section_stock SET quantity = quantity - ?
          WHERE factory_id = ? AND section_id = ? AND material_id = ? AND quantity >= ?
        `).run(transfer.quantity, transfer.factory_id, transfer.from_section, transfer.material_id, transfer.quantity);
        if (!updatedSectionStock.changes) return false;
      }
      if (transfer.to_section === 0) {
        db.prepare("UPDATE stock SET quantity = quantity + ? WHERE factory_id = ? AND material_id = ?")
          .run(transfer.quantity, transfer.factory_id, transfer.material_id);
      } else {
        db.prepare(`INSERT INTO section_stock (factory_id, section_id, material_id, quantity) VALUES (?, ?, ?, ?)
          ON CONFLICT(factory_id, section_id, material_id) DO UPDATE SET quantity = quantity + excluded.quantity`)
          .run(transfer.factory_id, transfer.to_section, transfer.material_id, transfer.quantity);
      }
      db.prepare("UPDATE transfers SET status = 'accepted' WHERE id = ?").run(transfer.id);
      return true;
    }
    db.prepare("UPDATE transfers SET status = 'rejected', note = ? WHERE id = ?")
      .run(String(req.body.note).trim(), transfer.id);
    return true;
  });
  if (!review()) return fail(res, 400, decision === "accepted" ? "Not enough stock remains at the source location to fulfil this transfer request." : "This transfer request has already been reviewed.");
  res.json({ message: `Transfer ${decision}.` });
});
}

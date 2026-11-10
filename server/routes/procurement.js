import { nextFactoryIdentifier } from "../database/identifiers.js";

export function registerProcurementRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.post("/api/procurement", authenticate, requireRole("keeper"), (req, res) => {
  const { materialId, quantity } = req.body;
  const material = db.prepare(`
    SELECT * FROM materials
    WHERE id = ? AND is_active = 1 AND (factory_id IS NULL OR factory_id = ?)
  `).get(Number(materialId), req.user.factory_id);
  if (!material || !Number.isFinite(Number(quantity)) || quantity <= 0) return fail(res, 400, "Choose a material and enter a quantity greater than zero.");
  const create = db.transaction(() => {
    const { code: requestCode } = nextFactoryIdentifier(db, req.user.factory_id, "request");
    const result = db.prepare("INSERT INTO procurement_requests (factory_id, created_by, material_id, quantity, request_code) VALUES (?, ?, ?, ?, ?)")
      .run(req.user.factory_id, req.user.id, material.id, Number(quantity), requestCode);
    return { id: result.lastInsertRowid, requestCode };
  });
  res.status(201).json({ ...create(), message: "Restock request sent to your factory manager." });
});
app.get("/api/procurement", authenticate, requireRole("admin", "manager", "keeper"), (req, res) => {
  const factoryId = scopedFactory(req);
  res.json(db.prepare(`
    SELECT p.*, m.name AS material, m.unit, u.display_name AS requested_by FROM procurement_requests p
    JOIN materials m ON m.id = p.material_id JOIN users u ON u.id = p.created_by
    WHERE p.factory_id = ? ORDER BY p.created_at DESC
  `).all(factoryId));
});
app.patch("/api/procurement/:id/review", authenticate, requireRole("manager", "admin"), (req, res) => {
  const request = db.prepare("SELECT * FROM procurement_requests WHERE id = ?").get(req.params.id);
  if (!request || (req.user.role !== "admin" && request.factory_id !== req.user.factory_id)) return fail(res, 404, "Restock request not found.");
  const decision = req.body.decision;
  const expected = req.user.role === "manager" ? "manager_pending" : "admin_pending";
  if (request.status !== expected) return fail(res, 409, "This request is not awaiting your review.");
  if (!["approved", "rejected"].includes(decision)) return fail(res, 400, "Choose approve or reject.");
  if (decision === "rejected" && !String(req.body.note || "").trim()) return fail(res, 400, "A reason is required when rejecting a request.");
  const nextStatus = decision === "rejected" ? "rejected" : req.user.role === "manager" ? "admin_pending" : "ordered";
  const noteColumn = req.user.role === "manager" ? "manager_note" : "admin_note";
  db.prepare(`UPDATE procurement_requests SET status = ?, ${noteColumn} = ? WHERE id = ?`)
    .run(nextStatus, String(req.body.note || "").trim() || null, request.id);
  res.json({ message: nextStatus === "admin_pending" ? "Approved and forwarded to the admin." : `Request ${nextStatus}.` });
});
app.patch("/api/procurement/:id/arrived", authenticate, requireRole("admin"), (req, res) => {
  const request = db.prepare("SELECT * FROM procurement_requests WHERE id = ? AND status = 'ordered'").get(req.params.id);
  if (!request) return fail(res, 404, "Ordered request not found.");
  db.prepare("UPDATE procurement_requests SET status = 'awaiting_receipt' WHERE id = ?").run(request.id);
  res.json({ message: "Arrival recorded. The stock keeper can now confirm the physical quantity." });
});
app.patch("/api/procurement/:id/receive", authenticate, requireRole("keeper"), (req, res) => {
  const request = db.prepare(`
    SELECT * FROM procurement_requests WHERE id = ? AND factory_id = ? AND status = 'awaiting_receipt'
  `).get(req.params.id, req.user.factory_id);
  if (!request) return fail(res, 404, "Delivered request awaiting stock-keeper confirmation was not found.");
  const actualQuantity = Number(req.body.actualQuantity);
  const receiptNote = String(req.body.receiptNote || "").trim();
  if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) return fail(res, 400, "Enter the quantity physically counted.");
  if (Math.abs(actualQuantity - request.quantity) > 0.001 && !receiptNote) {
    return fail(res, 400, "Add a note when the physical quantity differs from the ordered quantity.");
  }
  const receive = db.transaction(() => {
    const result = db.prepare(`
      UPDATE procurement_requests SET status = 'received', received_quantity = ?, receipt_note = ?
      WHERE id = ? AND status = 'awaiting_receipt'
    `).run(actualQuantity, receiptNote || null, request.id);
    if (!result.changes) return false;
    db.prepare("UPDATE stock SET quantity = quantity + ? WHERE factory_id = ? AND material_id = ?")
      .run(actualQuantity, request.factory_id, request.material_id);
    return true;
  });
  if (!receive()) return fail(res, 409, "This delivery has already been confirmed.");
  res.json({ message: "Physical quantity confirmed and added to factory stock." });
});
}

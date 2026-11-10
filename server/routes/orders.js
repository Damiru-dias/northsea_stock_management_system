import { nextFactoryIdentifier } from "../database/identifiers.js";

export function registerOrdersRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/orders", authenticate, (req, res) => {
  const factoryId = scopedFactory(req);
  const isSupervisor = req.user.role === "supervisor";
  const supervisorOrderScope = isSupervisor
    ? `AND o.status IN ('approved', 'in_production') AND EXISTS (
        SELECT 1 FROM transfers t
        WHERE t.factory_id = o.factory_id AND t.order_id = o.id AND t.status = 'accepted'
          AND (t.from_section = ? OR t.to_section = ?)
        GROUP BY t.order_id, t.material_id
        HAVING SUM(CASE WHEN t.to_section = ? THEN t.quantity WHEN t.from_section = ? THEN -t.quantity ELSE 0 END) > 0
      )`
    : "";
  const orders = db.prepare(`
    SELECT o.*, u.display_name AS requested_by FROM orders o
    JOIN users u ON u.id = o.created_by
    WHERE o.factory_id = ? AND o.status != 'completed' ${supervisorOrderScope}
    ORDER BY o.created_at DESC
  `).all(...(isSupervisor
    ? [factoryId, req.user.section_id, req.user.section_id, req.user.section_id, req.user.section_id]
    : [factoryId]));
  const items = db.prepare(`
    SELECT om.order_id AS orderId, om.material_id AS materialId, om.quantity, m.name AS material, m.unit FROM order_materials om
    JOIN materials m ON m.id = om.material_id WHERE om.order_id IN
    (SELECT id FROM orders WHERE factory_id = ?)
  `).all(factoryId);
  const transferHistory = db.prepare(`
    SELECT t.order_id AS orderId, t.material_id AS materialId, t.from_section AS fromSection,
      t.to_section AS toSection, t.quantity, t.status
    FROM transfers t JOIN orders o ON o.id = t.order_id
    WHERE o.factory_id = ? AND t.status != 'rejected'
  `).all(factoryId);
  res.json(orders.map((order) => ({
    ...order,
    materials: items.filter((item) => item.orderId === order.id).map((item) => {
      const itemTransfers = transferHistory.filter((transfer) => transfer.orderId === item.orderId && transfer.materialId === item.materialId);
      const transferredQuantity = itemTransfers
        .filter((transfer) => transfer.fromSection === null)
        .reduce((total, transfer) => total + transfer.quantity, 0);
      const sectionQuantity = (sectionId) => {
        const received = itemTransfers
          .filter((transfer) => transfer.toSection === sectionId && transfer.status === "accepted")
          .reduce((total, transfer) => total + transfer.quantity, 0);
        const sent = itemTransfers
          .filter((transfer) => transfer.fromSection === sectionId && transfer.status === "accepted")
          .reduce((total, transfer) => total + transfer.quantity, 0);
        return Math.max(0, received - sent);
      };
      const sectionQuantities = isSupervisor
        ? { [req.user.section_id]: sectionQuantity(req.user.section_id) }
        : Object.fromEntries(sections.map((section) => [section.id, sectionQuantity(section.id)]));
      if (isSupervisor) {
        const quantity = sectionQuantities[req.user.section_id] || 0;
        return { ...item, quantity, transferredQuantity: 0, remainingQuantity: quantity, sectionQuantities };
      }
      return { ...item, transferredQuantity, remainingQuantity: Math.max(0, item.quantity - transferredQuantity), sectionQuantities };
    }),
  })).filter((order) => !isSupervisor || order.materials.length > 0));
});
app.post("/api/orders", authenticate, requireRole("keeper"), (req, res) => {
  const { customer, pieces, ply, meshSize, widthM, lengthM, dyeColor, materials = [] } = req.body;
  if (!String(customer || "").trim() || !Number.isInteger(Number(pieces)) || Number(pieces) < 1 ||
      !Number.isInteger(Number(ply)) || ply < 1 || ply > 60 || !meshSize ||
      !Number.isFinite(Number(widthM)) || widthM <= 0 ||
      !Number.isFinite(Number(lengthM)) || lengthM <= 0 || lengthM > 3000) {
    return fail(res, 400, "Enter valid customer, pieces, ply (1–60), mesh, width and length (up to 3,000 m).");
  }
  const normalized = materials.map((item) => ({ materialId: Number(item.materialId), quantity: Number(item.quantity) }));
  if (!normalized.length || normalized.some((item) => !Number.isInteger(item.materialId) || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return fail(res, 400, "Add at least one material with a quantity greater than zero.");
  }
  if (normalized.some(({ materialId }) => !db.prepare(`
    SELECT id FROM materials
    WHERE id = ? AND is_active = 1 AND (factory_id IS NULL OR factory_id = ?)
  `).get(materialId, req.user.factory_id))) return fail(res, 400, "A selected material is invalid, archived, or not available in your factory.");
  const dye = db.prepare(`
    SELECT id FROM materials WHERE is_dye = 1 AND is_active = 1 AND (factory_id IS NULL OR factory_id = ?)
  `).get(req.user.factory_id);
  if (dye && normalized.some((item) => item.materialId === dye.id) && !String(dyeColor || "").trim()) return fail(res, 400, "Enter the dye colour before submitting this order.");
  const create = db.transaction(() => {
    const { code: orderCode } = nextFactoryIdentifier(db, req.user.factory_id, "order");
    const result = db.prepare(`
      INSERT INTO orders (factory_id, created_by, customer, pieces, ply, mesh_size, width_m, length_m, dye_color, order_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.factory_id, req.user.id, String(customer).trim(), Number(pieces), Number(ply), String(meshSize), Number(widthM), Number(lengthM), String(dyeColor || "").trim() || null, orderCode);
    const insertItem = db.prepare("INSERT INTO order_materials (order_id, material_id, quantity) VALUES (?, ?, ?)");
    for (const item of normalized) insertItem.run(result.lastInsertRowid, item.materialId, item.quantity);
    return { id: result.lastInsertRowid, orderCode };
  });
  res.status(201).json(create());
});
app.patch("/api/orders/:id/review", authenticate, requireRole("manager"), (req, res) => {
  const { decision, note = "" } = req.body;
  if (!["approved", "rejected"].includes(decision)) return fail(res, 400, "Choose approve or reject.");
  if (decision === "rejected" && !String(note).trim()) return fail(res, 400, "A reason is required when rejecting an order.");
  const result = db.prepare("UPDATE orders SET status = ?, manager_note = ? WHERE id = ? AND factory_id = ? AND status = 'pending'")
    .run(decision, String(note).trim() || null, req.params.id, req.user.factory_id);
  if (!result.changes) return fail(res, 404, "Pending order not found in your factory.");
  res.json({ message: `Order ${decision}.` });
});
app.patch("/api/orders/:id/status", authenticate, requireRole("keeper"), (req, res) => {
  const { status } = req.body;
  if (!["in_production", "completed"].includes(status)) return fail(res, 400, "Invalid order status.");
  const result = db.prepare("UPDATE orders SET status = ? WHERE id = ? AND factory_id = ? AND status IN ('approved','in_production')")
    .run(status, req.params.id, req.user.factory_id);
  if (!result.changes) return fail(res, 404, "Approved order not found in your factory.");
  res.json({ message: "Order status updated." });
});
}

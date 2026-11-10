export function registerDashboardRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/dashboard", authenticate, (req, res) => {
  const factoryId = scopedFactory(req);
  const isSupervisor = req.user.role === "supervisor";
  const sectionId = req.user.section_id;
  const sectionOrderScope = isSupervisor
    ? `AND o.status IN ('approved', 'in_production') AND EXISTS (
        SELECT 1 FROM transfers t
        WHERE t.factory_id = o.factory_id AND t.order_id = o.id AND t.status = 'accepted'
          AND (t.from_section = ? OR t.to_section = ?)
        GROUP BY t.order_id, t.material_id
        HAVING SUM(CASE WHEN t.to_section = ? THEN t.quantity WHEN t.from_section = ? THEN -t.quantity ELSE 0 END) > 0
      )`
    : "";
  const scalar = (sql, ...args) => db.prepare(sql).get(...args).value;
  const openOrders = isSupervisor
    ? scalar(`SELECT COUNT(*) AS value FROM orders o WHERE o.factory_id = ? ${sectionOrderScope}`, factoryId, sectionId, sectionId, sectionId, sectionId)
    : scalar("SELECT COUNT(*) AS value FROM orders WHERE factory_id = ? AND status IN ('pending','approved','in_production')", factoryId);
  const pendingApprovals = isSupervisor ? 0 : scalar("SELECT COUNT(*) AS value FROM orders WHERE factory_id = ? AND status = 'pending'", factoryId);
  const lowStock = isSupervisor
    ? scalar("SELECT COUNT(*) AS value FROM section_stock WHERE factory_id = ? AND section_id = ? AND quantity < 100", factoryId, sectionId)
    : scalar("SELECT COUNT(*) AS value FROM stock WHERE factory_id = ? AND quantity < 100", factoryId);
  const pendingTransfers = isSupervisor
    ? scalar("SELECT COUNT(*) AS value FROM transfers WHERE factory_id = ? AND status = 'pending' AND is_deleted = 0 AND (from_section = ? OR to_section = ?)", factoryId, sectionId, sectionId)
    : scalar("SELECT COUNT(*) AS value FROM transfers WHERE factory_id = ? AND status = 'pending' AND is_deleted = 0", factoryId);
  const recentOrders = db.prepare(`
    SELECT o.*, u.display_name AS requested_by FROM orders o
    JOIN users u ON u.id = o.created_by
    WHERE o.factory_id = ? AND o.status != 'completed' ${sectionOrderScope}
    ORDER BY o.created_at DESC LIMIT 5
  `).all(...(isSupervisor ? [factoryId, sectionId, sectionId, sectionId, sectionId] : [factoryId]));
  const stock = isSupervisor ? db.prepare(`
    SELECT m.name AS material, m.unit, ss.quantity FROM section_stock ss
    JOIN materials m ON m.id = ss.material_id
    WHERE ss.factory_id = ? AND ss.section_id = ? ORDER BY m.id
  `).all(factoryId, sectionId) : db.prepare(`
    SELECT s.quantity, m.name AS material, m.unit FROM stock s
    JOIN materials m ON m.id = s.material_id WHERE s.factory_id = ? ORDER BY m.id
  `).all(factoryId);
  const sectionMaterials = isSupervisor
    ? scalar("SELECT COUNT(*) AS value FROM section_stock WHERE factory_id = ? AND section_id = ? AND quantity > 0", factoryId, sectionId)
    : undefined;
  const sectionTransfers = isSupervisor
    ? scalar("SELECT COUNT(*) AS value FROM transfers WHERE factory_id = ? AND is_deleted = 0 AND (from_section = ? OR to_section = ?)", factoryId, sectionId, sectionId)
    : undefined;
  res.json({ stats: { openOrders, pendingApprovals, lowStock, pendingTransfers, sectionMaterials, sectionTransfers }, recentOrders, stock });
});
}

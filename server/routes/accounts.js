export function registerAccountsRoutes({ app, db, factories, sections, jwt, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/accounts", authenticate, requireRole("admin"), (_req, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.factory_id AS factoryId, u.role, u.section_id AS sectionId, u.display_name AS displayName,
      u.must_change_password AS mustChangePassword, f.name AS factoryName, s.name AS sectionName
    FROM users u LEFT JOIN sections s ON s.id = u.section_id
    LEFT JOIN factories f ON f.id = u.factory_id
    ORDER BY u.role, u.factory_id, u.section_id
  `).all());
});
app.post("/api/accounts/:id/reset-password", authenticate, requireRole("admin"), (req, res) => {
  const account = db.prepare("SELECT id, role FROM users WHERE id = ?").get(Number(req.params.id));
  if (!account || account.role === "admin") return fail(res, 404, "Resettable account not found.");

  const temporaryPassword = "ChangeMe123!";
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, auth_version = auth_version + 1 WHERE id = ?")
    .run(bcrypt.hashSync(temporaryPassword, 10), account.id);
  res.json({ temporaryPassword, message: "Password reset to the common temporary password. The user must change it at next login." });
});
}

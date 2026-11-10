export function registerAuthRoutes({ app, db, factories, sections, jwt, JWT_SECRET, bcrypt, randomInt, safeUser, getUser, authenticate, requireRole, scopedFactory, fail }) {
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/config", (_req, res) => res.json({ factories, sections }));
app.post("/api/auth/login", (req, res) => {
  const { factoryId, role, sectionId, password } = req.body;
  if (!["admin", "manager", "keeper", "supervisor"].includes(role) || !password) {
    return fail(res, 400, "Choose an account type and enter its password.");
  }
  const factory = role === "admin" ? null : Number(factoryId);
  const section = role === "supervisor" ? Number(sectionId) : null;
  if (role !== "admin" && !factories.some((item) => item.id === factory)) return fail(res, 400, "Choose a valid factory.");
  if (role === "supervisor" && !sections.some((item) => item.id === section)) return fail(res, 400, "Choose a valid section.");
  const user = db.prepare(
    "SELECT * FROM users WHERE role = ? AND factory_id IS ? AND section_id IS ?",
  ).get(role, factory, section);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return fail(res, 401, "That password doesn't match this account.");
  const token = jwt.sign({ sub: user.id, authVersion: user.auth_version }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, user: safeUser(user) });
});
app.get("/api/me", authenticate, (req, res) => res.json({ user: safeUser(req.user) }));
app.patch("/api/me", authenticate, (req, res) => {
  const name = String(req.body.displayName || "").trim();
  if (name.length < 2 || name.length > 80) return fail(res, 400, "Name must be between 2 and 80 characters.");
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(name, req.user.id);
  res.json({ user: safeUser(getUser(req.user.id)) });
});
app.patch("/api/me/password", authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!bcrypt.compareSync(String(currentPassword || ""), req.user.password_hash)) return fail(res, 400, "Current password is incorrect.");
  if (typeof newPassword !== "string" || newPassword.length < 8) return fail(res, 400, "New password must be at least 8 characters.");
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, auth_version = auth_version + 1 WHERE id = ?")
    .run(bcrypt.hashSync(newPassword, 10), req.user.id);
  const user = getUser(req.user.id);
  const token = jwt.sign({ sub: user.id, authVersion: user.auth_version }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, user: safeUser(user), message: "Password updated." });
});
}

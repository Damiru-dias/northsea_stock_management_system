import jwt from "jsonwebtoken";

export function createMiddleware({ db, JWT_SECRET }) {
  const safeUser = ({ id, factory_id, role, section_id, display_name, must_change_password }) => ({
    id,
    factoryId: factory_id,
    role,
    sectionId: section_id,
    displayName: display_name,
    mustChangePassword: Boolean(must_change_password),
  });
  const fail = (res, status, message) => res.status(status).json({ error: message });
  const getUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return fail(res, 401, "Please sign in to continue.");
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = getUser(payload.sub);
      if (!user) return fail(res, 401, "This account is no longer available.");
      if ((payload.authVersion ?? 0) !== user.auth_version) return fail(res, 401, "Your password changed. Please sign in again.");
      req.user = user;
      if (user.must_change_password && !(req.method === "PATCH" && req.path === "/api/me/password")) {
        return fail(res, 403, "Password reset required. Set a new password to continue.");
      }
      next();
    } catch {
      return fail(res, 401, "Your session has expired. Please sign in again.");
    }
  };
  const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) return fail(res, 403, "You do not have permission to do that.");
    next();
  };
  const scopedFactory = (req) => (req.user.role === "admin" ? Number(req.query.factoryId || req.body.factoryId || 1) : req.user.factory_id);
  return { safeUser, fail, getUser, authenticate, requireRole, scopedFactory };
}

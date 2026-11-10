import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { db, factories, sections } from "./db.js";
import { createMiddleware } from "./middleware.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerMaterialsRoutes } from "./routes/materials.js";
import { registerStockRoutes } from "./routes/stock.js";
import { registerOrdersRoutes } from "./routes/orders.js";
import { registerProcurementRoutes } from "./routes/procurement.js";
import { registerTransfersRoutes } from "./routes/transfers.js";
import { registerAccountsRoutes } from "./routes/accounts.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("Set JWT_SECRET before starting the server in production.");
}
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString("hex");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const routeDependencies = { app, db, factories, sections, jwt, JWT_SECRET, bcrypt, randomInt, ...createMiddleware({ db, JWT_SECRET }) };
registerAuthRoutes(routeDependencies);
registerDashboardRoutes(routeDependencies);
registerMaterialsRoutes(routeDependencies);
registerStockRoutes(routeDependencies);
registerOrdersRoutes(routeDependencies);
registerProcurementRoutes(routeDependencies);
registerTransfersRoutes(routeDependencies);
registerAccountsRoutes(routeDependencies);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => console.log(`Stock management API listening on http://localhost:${PORT}`));

# Northsea Stock Management

A stock-management system for Northsea's three independent fishing-net factories — Lunuwila, Weerawila, and Jaffna — built with React, Vite, Node.js, Express, and SQLite.

## Run locally

1. Install Node.js 22.5 or newer (the server uses Node's built-in SQLite driver).
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The API runs on `http://localhost:3001`; SQLite data is stored in `server/data/stock-management.db`. Set `DATABASE_PATH` to use another SQLite file for testing or deployment.

## Code modules

- Frontend:
  - `src/App.jsx` coordinates authentication, application state, navigation, and shared layout.
  - `src/pages/` contains one file per workspace page: overview, orders, inventory, stock adjustments, transfers, restock, and accounts.
  - `src/components/common/` contains reusable page headings, tables, status badges, and empty states.
  - `src/components/` contains the sign-in screen and modal workflows; `src/lib/` contains API and utility helpers.
  - Sidebar pages have direct URLs (for example, `/orders` and `/restock-requests`) and support browser back/forward navigation.
- Backend:
  - `server/index.js` configures Express and registers routes.
  - `server/routes/` groups endpoints by feature: auth, dashboard, materials, stock, orders, procurement, transfers, and accounts.
  - `server/middleware.js` contains authentication, role checks, and factory scoping.
- Database:
  - `server/db.js` initializes the database modules and exports the shared connection and factory/section configuration.
  - `server/database/connection.js`, `schema.js`, `migrations.js`, and `seed.js` separately handle the SQLite connection, table definitions, upgrades, and starter data.

## Initial sign-in

All seeded accounts start with the temporary password `ChangeMe123!`. Change it after signing in from the account menu. Set a private `JWT_SECRET` environment variable before deploying.

The login screen selects the factory, role, and (for supervisors) section. Accounts are pre-created and cannot be deleted. There is one manager and one stock keeper per factory, plus one supervisor for each of the six sections in each factory.
Only the admin can reset another account's password from the Accounts page. A reset sets the common temporary password `ChangeMe123!`; the user must replace it at their next login. A strong password suggestion is generated for that required change. The admin account itself cannot be reset from the account list.

## Included workflows

- Customer net orders with pieces, ply (1–60), fractional mesh size, width, length (up to 3,000 m), dye colour and per-material quantities.
- Orders and restock requests receive factory-specific identifiers (`ORD-L0001`, `REQ-L0001`, etc.); the `L`, `W`, and `J` prefixes identify Lunuwila, Weerawila, and Jaffna.
- Manager approval or rejection (a rejection requires a reason), followed by production status tracking.
- Role-based in-app notifications for pending order and restock reviews, transfer confirmations, delivery checks and stock-removal approvals. The notification bell refreshes its action list automatically every minute and links directly to the relevant workspace.
- Admin-managed shared materials and stock-keeper-created factory-only materials, each allocated to one or more sections; stock keepers can request factory-stock transfers to any allocated section, optionally linking an approved order. Each handoff waits for confirmation from its receiver: Section 1 through Section 6 supervisors accept the previous section's request, and the stock keeper accepts returns from Section 6. Source and destination stock update only after acceptance. Managers and admins can hide transfer records from history without changing stock balances.
- Restock request chain: stock keeper → factory manager → admin ordering → admin delivery-arrival notice → stock keeper physical quantity confirmation.
- Stock keepers can add quantities directly to factory stock. Stock removal requests remain pending until the factory manager approves or rejects them; approved removals are deducted only if enough stock remains.
- Factory-scoped inventory, section stock, overview metrics and account directory. Admins can filter inventory by factory; stock keepers see and create materials only for their own factory. Supervisors see only manager-approved active orders and operations for their section. Completed orders are removed from active order lists after the stock keeper marks them complete.
- Materials use `kg`, `pcs`, or `liter`. Admins can edit material details and section allocations, change a material's unit from the preset options, or delete a material. Changing the unit does not convert existing quantities or history; the app asks for confirmation when history exists. Materials with stock or transaction history are archived instead of physically deleted so that records remain intact; archived materials stay visible in inventory/history but cannot be used in new transactions.

Factory stock is isolated by factory. Admins can switch the overview between factories. The seeded material list can be extended in `server/database/seed.js`.

## Production setup

Build the React app with `npm run build`. Configure a strong `JWT_SECRET`, protect the application behind HTTPS, and use an appropriate persistent SQLite volume (or migrate the schema to your preferred SQL database) for deployment.

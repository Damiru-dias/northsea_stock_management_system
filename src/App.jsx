import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request } from "./lib/api.js";
import { generateSuggestedPassword, roleName } from "./lib/utils.js";
import { Login, Logo } from "./components/Auth.jsx";
import { AccountsPage } from "./pages/AccountsPage.jsx";
import { InventoryPage } from "./pages/InventoryPage.jsx";
import { OrdersPage } from "./pages/OrdersPage.jsx";
import { Overview } from "./pages/OverviewPage.jsx";
import { RestockPage } from "./pages/RestockPage.jsx";
import { StockAdjustmentsPage } from "./pages/StockAdjustmentsPage.jsx";
import { TransfersPage } from "./pages/TransfersPage.jsx";
import { Modal, ModalContent } from "./components/Modal.jsx";
import { getNotifications, NotificationsPanel } from "./components/NotificationsPanel.jsx";

const pagePaths = {
  Overview: "/overview",
  Orders: "/orders",
  Inventory: "/inventory",
  Transfers: "/transfers",
  "Restock requests": "/restock-requests",
  "Stock adjustments": "/stock-adjustments",
  Accounts: "/accounts",
};
const pathPages = Object.fromEntries(Object.entries(pagePaths).map(([page, path]) => [path, page]));

function canViewPage(page, role) {
  if (["Overview", "Orders", "Inventory", "Transfers"].includes(page)) return true;
  if (page === "Restock requests") return ["admin", "manager", "keeper"].includes(role);
  if (page === "Stock adjustments") return ["keeper", "manager"].includes(role);
  return page === "Accounts" && role === "admin";
}

function App() {
  const [config, setConfig] = useState({ factories: [], sections: [] });
  const [token, setToken] = useState(() => localStorage.getItem("northsea-token") || localStorage.getItem("harborline-token"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("northsea-user") || localStorage.getItem("harborline-user")); } catch { return null; }
  });
  const [page, setPageState] = useState(() => pathPages[window.location.pathname] || "Overview");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stockData, setStockData] = useState({ stock: [], sectionStock: [] });
  const [materials, setMaterials] = useState([]);
  const [procurement, setProcurement] = useState([]);
  const [stockAdjustments, setStockAdjustments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [factoryView, setFactoryView] = useState("1");
  const [modal, setModal] = useState("");
  const [materialToEdit, setMaterialToEdit] = useState(null);
  const [receiptRequest, setReceiptRequest] = useState(null);
  const [resetCredential, setResetCredential] = useState(null);
  const [suggestedPassword, setSuggestedPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [filter, setFilter] = useState("All orders");
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationArea = useRef(null);

  useEffect(() => {
    request("/config").then(setConfig).catch((error) => setToast(error.message));
  }, []);

  function setPage(nextPage, replace = false) {
    setPageState(nextPage);
    const nextPath = pagePaths[nextPage];
    if (nextPath && window.location.pathname !== nextPath) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
    }
  }

  useEffect(() => {
    function syncPageFromLocation() {
      if (!token || !user) {
        if (window.location.pathname !== "/login") {
          window.history.replaceState({}, "", "/login");
        }
        return;
      }

      const requestedPage = pathPages[window.location.pathname];
      if (!requestedPage || !canViewPage(requestedPage, user.role)) {
        setPage("Overview", true);
        return;
      }
      setPageState(requestedPage);
    }

    window.addEventListener("popstate", syncPageFromLocation);
    syncPageFromLocation();
    return () => window.removeEventListener("popstate", syncPageFromLocation);
  }, [token, user]);

  const loadData = useCallback(async (silent = false) => {
    if (!token || !user || user.mustChangePassword) return;
    if (!silent) setLoading(true);
    const suffix = user.role === "admin" ? `?factoryId=${factoryView}` : "";
    try {
      const [dash, orderList, stock, materialList, procurementList, transferList, adjustmentList, accountList] = await Promise.all([
        request(`/dashboard${suffix}`, { token }),
        request(`/orders${suffix}`, { token }),
        request(`/stock${suffix}`, { token }),
        request(`/materials${user.role === "admin" ? suffix : ""}`, { token }),
        ["admin", "manager", "keeper"].includes(user.role) ? request(`/procurement${suffix}`, { token }) : Promise.resolve([]),
        request(`/transfers${suffix}`, { token }),
        ["keeper", "manager", "admin"].includes(user.role) ? request(`/stock-adjustments${suffix}`, { token }) : Promise.resolve([]),
        user.role === "admin" ? request("/accounts", { token }) : Promise.resolve([]),
      ]);
      setDashboard(dash); setOrders(orderList); setStockData(stock); setMaterials(materialList);
      setProcurement(procurementList); setTransfers(transferList); setStockAdjustments(adjustmentList); setAccounts(accountList);
    } catch (error) {
      setToast(error.message);
      if (error.message.includes("Password reset required")) {
        setSuggestedPassword(generateSuggestedPassword());
        setTemporaryPassword("");
        setModal("must-change-password");
      }
      if (error.message.includes("session") || error.message.includes("sign in")) signOut();
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, user, factoryView]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!token || !user || user.mustChangePassword) return undefined;
    const timer = window.setInterval(() => loadData(true), 60_000);
    return () => window.clearInterval(timer);
  }, [token, user, loadData]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3800);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function closeNotifications(event) {
      if (!notificationArea.current?.contains(event.target)) setNotificationsOpen(false);
    }
    document.addEventListener("mousedown", closeNotifications);
    return () => document.removeEventListener("mousedown", closeNotifications);
  }, []);
  useEffect(() => {
    if (user?.mustChangePassword && modal !== "must-change-password") {
      setSuggestedPassword(generateSuggestedPassword());
      setTemporaryPassword("");
      setModal("must-change-password");
    }
  }, [user, modal]);

  function signOut() {
    localStorage.removeItem("northsea-token"); localStorage.removeItem("northsea-user");
    localStorage.removeItem("harborline-token"); localStorage.removeItem("harborline-user");
    window.history.replaceState({}, "", "/login");
    setToken(null); setUser(null); setDashboard(null);
  }
  function onLogin(result, temporaryPassword = "") {
    localStorage.setItem("northsea-token", result.token); localStorage.setItem("northsea-user", JSON.stringify(result.user));
    setToken(result.token); setUser(result.user); setPage("Overview", true);
    if (result.user.mustChangePassword) {
      setSuggestedPassword(generateSuggestedPassword());
      setModal("must-change-password");
      setTemporaryPassword(temporaryPassword);
    }
  }
  async function mutate(path, method, body, message) {
    try {
      await request(path, { token, method, body: body ? JSON.stringify(body) : undefined });
      setToast(message); setModal(""); await loadData();
    } catch (error) { setToast(error.message); }
  }
  const factoryName = user?.role === "admin"
    ? config.factories.find((factory) => String(factory.id) === factoryView)?.name || "All factories"
    : config.factories.find((factory) => factory.id === user?.factoryId)?.name;
  const nav = useMemo(() => {
    const items = [
      { group: "WORKSPACE", links: [{ name: "Overview", icon: "◫" }, { name: "Orders", icon: "▤", badge: dashboard?.stats.pendingApprovals }, { name: "Inventory", icon: "▦" }, { name: "Transfers", icon: "⇄" }] },
      { group: "MANAGEMENT", links: [...(["admin", "manager", "keeper"].includes(user?.role) ? [{ name: "Restock requests", icon: "↗" }] : []), ...(["keeper", "manager"].includes(user?.role) ? [{ name: "Stock adjustments", icon: "±", badge: user.role === "manager" ? stockAdjustments.filter((item) => item.status === "pending").length : 0 }] : []), ...(user?.role === "admin" ? [{ name: "Accounts", icon: "♙" }] : [])] },
    ];
    return items;
  }, [dashboard, stockAdjustments, user]);
  const notifications = useMemo(() => user ? getNotifications({
    user,
    orders,
    procurement,
    transfers,
    stockAdjustments,
  }) : [], [user, orders, procurement, transfers, stockAdjustments]);

  if (!user || !token) return <Login config={config} onLogin={onLogin} />;

  const visibleOrders = orders.filter((order) => {
    const statusMatch = filter === "All orders" || order.status === filter;
    const searchMatch = `${order.customer} ${order.id}`.toLowerCase().includes(search.toLowerCase());
    return statusMatch && searchMatch;
  });
  const displaySection = config.sections.find((section) => section.id === user.sectionId);
  const title = page === "Overview" ? "Good morning" : page;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Logo small /><div>NORTHSEA<span>STOCK MANAGEMENT</span></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="factory-switch"><span className="factory-icon">⌂</span><span><b>{factoryName}</b><small>{user.role === "admin" ? "Company workspace" : "Factory workspace"}</small></span>{user.role === "admin" && <select aria-label="View factory" value={factoryView} onChange={(event) => setFactoryView(event.target.value)}>{config.factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.name}</option>)}</select>}</div>
        <nav>{nav.map((group) => <div key={group.group} className="nav-group"><div className="nav-label">{group.group}</div>{group.links.map((link) => <button key={link.name} className={`nav-link ${page === link.name ? "active" : ""}`} onClick={() => setPage(link.name)}><span className="nav-icon">{link.icon}</span>{link.name}{link.badge > 0 && <span className="nav-badge">{link.badge}</span>}</button>)}</div>)}</nav>
        <div className="sidebar-bottom">
          <div className="help-card"><span className="help-spark">✳</span><b>Need a hand?</b><p>Your operations guide is just a click away.</p><button onClick={() => setToast("Contact your system administrator for support.")}>Get support <span>↗</span></button></div>
          <button className="user-card" onClick={() => setModal("profile")}><span className="avatar">{user.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><span className="user-meta"><b>{user.displayName}</b><small>{displaySection ? displaySection.name : roleName[user.role]}</small></span><span className="user-more">···</span></button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>{page}</strong></div><div className="topbar-actions"><span className="today-label">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span><div className="notification-area" ref={notificationArea}><button className={`icon-button notification-button ${notificationsOpen ? "notification-active" : ""}`} aria-label={`Notifications${notifications.length ? `, ${notifications.length} pending` : ""}`} aria-expanded={notificationsOpen} aria-haspopup="true" onClick={() => setNotificationsOpen((open) => !open)}>♧{notifications.length > 0 && <span className="notification-count">{notifications.length > 99 ? "99+" : notifications.length}</span>}</button>{notificationsOpen && <NotificationsPanel notifications={notifications} onNavigate={(targetPage) => { if (targetPage === "Orders") { setFilter("All orders"); setSearch(""); } setPage(targetPage); setNotificationsOpen(false); }} onClose={() => setNotificationsOpen(false)} />}</div><span className="top-divider" /><button className="top-profile" onClick={() => setModal("profile")}><span className="avatar mini-avatar">{user.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><span>{user.displayName}</span><span className="chevron">⌄</span></button></div></header>
        <div className="page-content">
          {page === "Overview" && <Overview dashboard={dashboard} factoryName={factoryName} orders={orders} stock={user.role === "supervisor" ? dashboard?.stock || [] : stockData.stock} user={user} onPage={setPage} loading={loading} />}
          {page === "Orders" && <OrdersPage orders={visibleOrders} allOrders={orders} materials={materials} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} user={user} onNew={() => setModal("order")} onReview={(id, decision) => handleReview(id, decision)} onStatus={(id, status) => mutate(`/orders/${id}/status`, "PATCH", { status }, "Order status updated.")} />}
          {page === "Inventory" && <InventoryPage stockData={stockData} materials={materials} user={user} factories={config.factories} factoryView={factoryView} onFactoryChange={setFactoryView} onRestock={() => setModal("restock")} onTransfer={() => setModal("transfer")} onAddMaterial={() => { setMaterialToEdit(null); setModal("material"); }} onEditMaterial={(material) => { setMaterialToEdit(material); setModal("material-edit"); }} onDeleteMaterial={deleteMaterial} onStockAdjustment={(action) => setModal(action === "add" ? "stock-add" : "stock-remove")} />}
          {page === "Transfers" && <TransfersPage transfers={transfers} user={user} onReview={handleTransferReview} onDelete={handleDeleteTransfer} onNew={() => setModal("transfer")} />}
          {page === "Restock requests" && <RestockPage requests={procurement} user={user} onNew={() => setModal("restock")} onReview={handleProcurementReview} onArrived={(id) => mutate(`/procurement/${id}/arrived`, "PATCH", {}, "Arrival recorded. The stock keeper can confirm the counted quantity.")} onReceive={(item) => { setReceiptRequest(item); setModal("receipt"); }} />}
          {page === "Stock adjustments" && <StockAdjustmentsPage adjustments={stockAdjustments} user={user} onReview={handleStockAdjustmentReview} />}
          {page === "Accounts" && <AccountsPage accounts={accounts} factories={config.factories} sections={config.sections} factoryView={factoryView} onReset={resetAccount} />}
        </div>
      </main>
      {modal && <Modal onClose={() => { if (modal === "must-change-password") return; setModal(""); setReceiptRequest(null); setResetCredential(null); setMaterialToEdit(null); }}><ModalContent type={modal} user={user} orders={orders} materials={materials} stock={stockData.stock} sections={config.sections} materialToEdit={materialToEdit} receiptRequest={receiptRequest} resetCredential={resetCredential} temporaryPassword={temporaryPassword} suggestedPassword={suggestedPassword} setSuggestedPassword={setSuggestedPassword} onSubmit={handleModalSubmit} onPassword={handlePassword} onName={handleName} /></Modal>}
      {toast && <div className={`toast ${toast.includes("reason") || toast.includes("error") ? "toast-error" : ""}`} role="status"><span>✳</span>{toast}<button onClick={() => setToast("")}>×</button></div>}
    </div>
  );

  async function handleReview(id, decision) {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("Please enter a reason for rejecting this order:") || "";
      if (!note.trim()) { setToast("A reason is required when rejecting an order."); return; }
    }
    await mutate(`/orders/${id}/review`, "PATCH", { decision, note }, `Order ${decision}.`);
  }
  async function handleTransferReview(id, decision) {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("Please enter a reason for rejecting this transfer:") || "";
      if (!note.trim()) { setToast("A reason is required when rejecting a transfer."); return; }
    }
    await mutate(`/transfers/${id}/review`, "PATCH", { decision, note }, `Transfer ${decision}.`);
  }
  async function handleDeleteTransfer(id) {
    if (!window.confirm("Remove this transfer from history? Stock balances will not change.")) return;
    await mutate(`/transfers/${id}`, "DELETE", undefined, "Transfer removed from history. Stock was unchanged.");
  }
  async function handleProcurementReview(id, decision) {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("Please enter a reason for rejecting this request:") || "";
      if (!note.trim()) { setToast("A reason is required when rejecting a request."); return; }
    }
    await mutate(`/procurement/${id}/review`, "PATCH", { decision, note }, decision === "approved" && user.role === "manager" ? "Approved and sent to admin for review." : `Request ${decision}.`);
  }
  async function handleStockAdjustmentReview(id, decision) {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("Please enter a reason for rejecting this stock removal:") || "";
      if (!note.trim()) { setToast("A reason is required when rejecting a stock removal."); return; }
    }
    await mutate(`/stock-adjustments/${id}/review`, "PATCH", { decision, note }, `Stock removal ${decision}.`);
  }
  async function handleModalSubmit(type, values) {
    if (type === "order") {
      const result = await request("/orders", { token, method: "POST", body: JSON.stringify(values) });
      setToast(`Order ${result.orderCode} sent to your manager for approval.`); setModal(""); await loadData(); return;
    }
    if (type === "restock") {
      const result = await request("/procurement", { token, method: "POST", body: JSON.stringify(values) });
      setToast(`Restock request ${result.requestCode} sent to your manager.`); setModal(""); await loadData();
      return;
    }
    if (type === "transfer") {
      await request("/transfers", { token, method: "POST", body: JSON.stringify(values) });
      setToast("Transfer request sent to the receiving user for confirmation."); setModal(""); await loadData();
      return;
    }
    if (type === "material") {
      await request("/materials", { token, method: "POST", body: JSON.stringify(values) });
      setToast(user.role === "admin" ? "Material added to all factories." : "Material added to your factory.");
      setModal(""); setMaterialToEdit(null); await loadData();
      return;
    }
    if (type === "material-edit") {
      await request(`/materials/${materialToEdit.id}`, { token, method: "PATCH", body: JSON.stringify(values) });
      setToast("Material details updated."); setModal(""); setMaterialToEdit(null); await loadData();
      return;
    }
    if (type === "stock-add" || type === "stock-remove") {
      const result = await request("/stock-adjustments", { token, method: "POST", body: JSON.stringify({ ...values, action: type === "stock-add" ? "add" : "remove" }) });
      setToast(result.message); setModal(""); await loadData();
      return;
    }
    if (type === "receipt") {
      await request(`/procurement/${receiptRequest.id}/receive`, { token, method: "PATCH", body: JSON.stringify(values) });
      setToast("Physical receipt confirmed and factory stock updated.");
      setModal(""); setReceiptRequest(null); await loadData();
    }
  }
  async function deleteMaterial(material) {
    if (!window.confirm(`Delete "${material.name}"? Materials with stock or history are archived to preserve records; unused materials are permanently deleted.`)) return;
    try {
      const result = await request(`/materials/${material.id}`, { token, method: "DELETE" });
      setToast(result.message);
      await loadData();
    } catch (error) {
      setToast(error.message);
    }
  }
  async function handleName(displayName) {
    try {
      const result = await request("/me", { token, method: "PATCH", body: JSON.stringify({ displayName }) });
      setUser(result.user); localStorage.setItem("northsea-user", JSON.stringify(result.user));
      setToast("Your display name has been updated."); setModal("");
    } catch (error) { setToast(error.message); }
  }
  async function handlePassword(values) {
    const result = await request("/me/password", { token, method: "PATCH", body: JSON.stringify(values) });
    setToken(result.token);
    localStorage.setItem("northsea-token", result.token);
    const updatedUser = result.user;
    setUser(updatedUser);
    localStorage.setItem("northsea-user", JSON.stringify(updatedUser));
    setTemporaryPassword("");
    setToast("Password updated.");
    setModal("");
  }
  async function resetAccount(account) {
    if (!window.confirm(`Reset the password for ${account.displayName}? They will need to set a new password at their next login.`)) return;
    try {
      const result = await request(`/accounts/${account.id}/reset-password`, { token, method: "POST" });
      setResetCredential({ account, temporaryPassword: result.temporaryPassword });
      setModal("reset-credential");
      await loadData();
    } catch (error) {
      setToast(error.message);
    }
  }
}

export default App;

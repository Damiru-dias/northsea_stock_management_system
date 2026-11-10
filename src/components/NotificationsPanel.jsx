import { dateLabel } from "../lib/utils.js";

export function getNotifications({ user, orders, procurement, transfers, stockAdjustments }) {
  const notifications = [];
  const add = (id, type, title, detail, page, createdAt) => {
    notifications.push({ id: `${type}-${id}`, type, title, detail, page, createdAt });
  };

  if (user.role === "manager") {
    orders.filter((order) => order.status === "pending").forEach((order) => {
      add(order.id, "Order review", `Order ${order.order_code || `#${order.id}`} needs review`, order.customer, "Orders", order.created_at);
    });
    procurement.filter((item) => item.status === "manager_pending").forEach((item) => {
      add(item.id, "Restock review", `${item.request_code || "Restock request"} needs review`, `${item.material} · ${item.quantity} ${item.unit}`, "Restock requests", item.created_at);
    });
    stockAdjustments.filter((item) => item.status === "pending" && item.action === "remove").forEach((item) => {
      add(item.id, "Stock approval", `Stock removal needs review`, `${item.material} · ${item.quantity} ${item.unit}`, "Stock adjustments", item.created_at);
    });
  }

  if (user.role === "admin") {
    procurement.filter((item) => item.status === "admin_pending").forEach((item) => {
      add(item.id, "Restock review", `${item.request_code || "Restock request"} needs ordering`, `${item.material} · ${item.quantity} ${item.unit}`, "Restock requests", item.created_at);
    });
  }

  if (user.role === "keeper") {
    procurement.filter((item) => item.status === "awaiting_receipt").forEach((item) => {
      add(item.id, "Delivery check", `${item.request_code || "Delivery"} is ready to receive`, `${item.material} · confirm the delivered quantity`, "Restock requests", item.created_at);
    });
    transfers.filter((item) => item.status === "pending" && item.from_section === 6 && item.to_section === 0).forEach((item) => {
      add(item.id, "Transfer confirmation", `Section 6 returned ${item.material}`, `${item.quantity} ${item.unit} · accept or reject the return`, "Transfers", item.created_at);
    });
  }

  if (user.role === "supervisor") {
    transfers.filter((item) => item.status === "pending" && item.to_section === user.sectionId).forEach((item) => {
      const source = item.from_section === null ? "Factory stock" : `Section ${item.from_section}`;
      add(item.id, "Transfer confirmation", `${item.material} transfer is waiting`, `${source} · ${item.quantity} ${item.unit} · accept or reject`, "Transfers", item.created_at);
    });
  }

  return notifications.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function NotificationsPanel({ notifications, onNavigate, onClose }) {
  return <section className="notification-panel" aria-label="Notifications">
    <div className="notification-panel-heading">
      <div><b>Notifications</b><small>{notifications.length ? `${notifications.length} item${notifications.length === 1 ? "" : "s"} need your attention` : "You're all caught up"}</small></div>
      <button type="button" className="notification-close" aria-label="Close notifications" onClick={onClose}>×</button>
    </div>
    {notifications.length ? <div className="notification-list">{notifications.map((item) => <button type="button" className="notification-item" key={item.id} onClick={() => onNavigate(item.page)}>
      <span className="notification-dot" />
      <span className="notification-copy"><b>{item.title}</b><span>{item.detail}</span><small>{item.type}{item.createdAt ? ` · ${dateLabel(item.createdAt)}` : ""}</small></span>
      <span className="notification-arrow">›</span>
    </button>)}</div> : <div className="notification-empty"><span>✓</span><p>No pending approvals or confirmations.</p></div>}
  </section>;
}

import { money } from "../lib/utils.js";
import { PageHeading } from "../components/common/PageHeading.jsx";
import { StatCard } from "../components/common/StatCard.jsx";
import { OrdersTable } from "../components/common/OrdersTable.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";

export function Overview({ dashboard, factoryName, orders, stock, user, onPage, loading }) {
  const stats = dashboard?.stats || {};
  const supervisor = user.role === "supervisor";
  return <>
    <PageHeading eyebrow={`${factoryName || "Factory"} · OPERATIONS`} title={user.role === "admin" ? "Operations overview" : "Good morning"} description={supervisor ? `Your ${user.sectionId === 6 ? "Packing" : `Section ${user.sectionId}`} operations at ${factoryName}.` : `Here's what's happening across ${factoryName || "your factory"} today.`} actions={<><button className="secondary-button" onClick={() => onPage("Inventory")}>View inventory <span>↗</span></button>{user.role === "keeper" && <button className="primary-button" onClick={() => onPage("Orders")}><span>＋</span> New order</button>}</>} />
    <div className="welcome-strip"><div><span className="welcome-icon">✳</span><span><b>{supervisor ? "Your section's approved work." : user.role === "manager" ? "Your team is making progress." : "A fresh day on the factory floor."}</b><small>{supervisor ? `${stats.openOrders || 0} active approved orders in your section.` : <>There are <strong>{stats.pendingApprovals || 0} orders</strong> waiting for approval.</>}</small></span></div><button onClick={() => onPage("Orders")}>{supervisor ? "View my orders" : "Review orders"} <span>→</span></button><div className="welcome-pattern" /></div>
    <div className="section-title-row"><div><h2>{supervisor ? "Your section at a glance" : "Factory at a glance"}</h2><p>{supervisor ? "A live snapshot of your section's operations." : "A live snapshot of your operations."}</p></div><span className="live-tag"><i /> LIVE</span></div>
    <div className="stats-grid">
      <StatCard label={supervisor ? "Active section orders" : "Open orders"} value={stats.openOrders} icon="▤" accent="mint" change={supervisor ? "Approved work in your section" : "Across all active stages"} />
      <StatCard label={supervisor ? "Materials in section" : "Awaiting approval"} value={supervisor ? stats.sectionMaterials : stats.pendingApprovals} icon={supervisor ? "▦" : "◷"} accent="sand" change={supervisor ? "Materials currently on hand" : "Needs manager review"} />
      <StatCard label={supervisor ? "Low section stock" : "Low stock items"} value={stats.lowStock} icon="▦" accent="rose" change="Below 100 units" />
      <StatCard label={supervisor ? "Section transfers" : "Pending transfers"} value={supervisor ? stats.sectionTransfers : stats.pendingTransfers} icon="⇄" accent="blue" change={supervisor ? "Transfers involving your section" : "Awaiting stock keeper"} />
    </div>
    <div className="overview-lower">
      <section className="panel recent-panel"><div className="panel-heading"><div><h2>{supervisor ? "Orders in your section" : "Recent orders"}</h2><p>{supervisor ? "Manager-approved orders connected to your section." : "The latest orders from your factory."}</p></div><button className="text-button" onClick={() => onPage("Orders")}>{supervisor ? "My orders" : "All orders"} <span>→</span></button></div><OrdersTable orders={dashboard?.recentOrders || []} compact /></section>
      <section className="panel stock-panel"><div className="panel-heading"><div><h2>{supervisor ? "Section material levels" : "Material levels"}</h2><p>{supervisor ? "Material currently on hand in your section." : "Factory stock on hand."}</p></div><button className="subtle-icon-button" onClick={() => onPage("Inventory")}>↗</button></div>{stock.slice(0, 5).map((item) => <div className="stock-item" key={item.material}><div className="material-symbol">{item.material.startsWith("Nylon") ? "≋" : item.material === "Dye" ? "◉" : "▧"}</div><div className="material-info"><b>{item.material}</b><small>Available stock</small></div><div className="stock-amount"><b>{money(item.quantity)} <small>{item.unit}</small></b><span className={`stock-state ${item.quantity < 100 ? "low" : ""}`}><i />{item.quantity < 100 ? "Low" : "In stock"}</span></div></div>)}{!stock.length && <EmptyState text={loading ? "Loading inventory…" : "No stock recorded yet."} />}</section>
    </div>
  </>;
}

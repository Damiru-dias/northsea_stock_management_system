import { PageHeading } from "../components/common/PageHeading.jsx";
import { OrdersTable } from "../components/common/OrdersTable.jsx";

export function OrdersPage({ orders, allOrders, materials, filter, setFilter, search, setSearch, user, onNew, onReview, onStatus }) {
  const statuses = user.role === "supervisor"
    ? ["All orders", "approved", "in_production"]
    : ["All orders", "pending", "approved", "in_production", "rejected"];
  return <>
    <PageHeading eyebrow="PRODUCTION · CUSTOMER REQUESTS" title="Orders" description={user.role === "supervisor" ? "Only manager-approved active orders connected to your section are shown." : "Create customer orders and follow every approval through production."} actions={user.role === "keeper" && <button className="primary-button" onClick={onNew}><span>＋</span> New order</button>} />
    <div className="stats-inline"><span><b>{allOrders.length}</b> {user.role === "supervisor" ? "section orders" : "active orders"}</span>{user.role !== "supervisor" && <><span className="inline-divider" /><span><b>{allOrders.filter((order) => order.status === "pending").length}</b> awaiting approval</span></>}<span className="inline-divider" /><span><b>{allOrders.filter((order) => order.status === "in_production").length}</b> in production</span></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="filter-tabs">{statuses.map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "All orders" ? item : item.replaceAll("_", " ")}</button>)}</div><div className="table-search"><span>⌕</span><input aria-label="Search orders" placeholder="Search orders..." value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><OrdersTable orders={orders} showCustomer showDetails materials={materials} user={user} onReview={onReview} onStatus={onStatus} /></section>
  </>;
}

import { useState } from "react";
import { money } from "../lib/utils.js";
import { PageHeading } from "../components/common/PageHeading.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";

export function InventoryPage({ stockData, materials, user, factories, factoryView, onFactoryChange, onRestock, onTransfer, onAddMaterial, onEditMaterial, onDeleteMaterial, onStockAdjustment }) {
  const [tab, setTab] = useState(user.role === "supervisor" ? "Section stock" : "Factory stock");
  const supervisor = user.role === "supervisor";
  const onHandByUnit = (supervisor ? stockData.sectionStock : stockData.stock).reduce((totals, item) => {
    totals[item.unit] = (totals[item.unit] || 0) + item.quantity;
    return totals;
  }, {});
  return <>
    <PageHeading eyebrow="MATERIALS · STOCK CONTROL" title="Inventory" description="Track factory stock, section balances and material allocation." actions={<>{["admin", "keeper"].includes(user.role) && <button className="secondary-button" onClick={onAddMaterial}>＋ Add material type</button>}{user.role === "keeper" && <><button className="secondary-button" onClick={() => onStockAdjustment("add")}>＋ Add stock</button><button className="secondary-button" onClick={() => onStockAdjustment("remove")}>− Request removal</button><button className="secondary-button" onClick={onTransfer}>⇄ Send to section</button><button className="primary-button" onClick={onRestock}><span>＋</span> Request stock</button></>}</>} />
    {user.role === "admin" && <label className="inventory-factory-filter">Factory
      <select aria-label="Filter inventory by factory" value={factoryView} onChange={(event) => onFactoryChange(event.target.value)}>
        {factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.name}</option>)}
      </select>
    </label>}
    <div className="inventory-summary"><div className="inventory-summary-icon">▦</div><span><small>TRACKED MATERIALS</small><b>{materials.filter((material) => material.isActive !== false).length} <small>active types</small></b></span><span className="inventory-sum-sep" /><span><small>{supervisor ? "YOUR SECTION STOCK" : "FACTORY STOCK"}</small><b>{Object.entries(onHandByUnit).map(([unit, quantity]) => `${money(quantity)} ${unit}`).join(" · ") || "0"} <small>on hand</small></b></span><span className="inventory-sum-right"><i /> Synced just now</span></div>
    <div className="inventory-tabs">{(supervisor ? ["Section stock"] : ["Factory stock", "Section stock"]).map((item) => <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === "Factory stock" ? <div className="inventory-grid">{stockData.stock.map((item) => <article className="material-card" key={item.id}><div className="material-card-top"><div className={`material-symbol big ${item.category === "Dye" ? "dye-icon" : ""}`}>{item.materialId <= 3 ? "≋" : item.category === "Dye" ? "◉" : "▧"}</div><span className={`pill ${item.isActive === false ? "pill-low" : item.quantity < 100 ? "pill-low" : "pill-good"}`}>{item.isActive === false ? "Archived" : item.quantity < 100 ? "Low stock" : "In stock"}</span></div><div className="material-category">{item.category} · {item.unit}</div><h3>{item.name}</h3><div className="material-amount">{money(item.quantity)} <span>{item.unit}</span></div><div className="stock-progress"><span className={item.quantity < 100 ? "progress-low" : ""} style={{ width: `${Math.min(100, item.quantity / 10)}%` }} /></div><div className="material-card-bottom"><span>Assigned sections</span><b>{(item.assignedSections || []).map((section) => `Section ${section.sectionId} · ${section.sectionName}`).join(", ") || "None"}</b></div>{user.role === "admin" && item.isActive !== false && <div className="material-admin-actions"><button className="small-action" onClick={() => onEditMaterial(materials.find((material) => material.id === item.materialId))}>Edit details</button><button className="reject-button" onClick={() => onDeleteMaterial(item)}>Delete / archive</button></div>}</article>)}</div>
      : <section className="panel table-panel"><div className="panel-heading section-stock-heading"><div><h2>Stock by section</h2><p>Material currently held at each production stage.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>SECTION</th><th>MATERIAL</th><th>ON HAND</th><th>UNIT</th></tr></thead><tbody>{stockData.sectionStock.map((item, index) => <tr key={`${item.sectionId}-${item.materialId}-${index}`}><td>Section {item.sectionId} · {item.sectionName}</td><td>{item.material}</td><td><b>{money(item.quantity)}</b></td><td>{item.unit}</td></tr>)}{!stockData.sectionStock.length && <tr><td colSpan="4"><EmptyState text="No materials have been moved to a section yet." /></td></tr>}</tbody></table></div></section>}
  </>;
}

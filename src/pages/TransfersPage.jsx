import { dateLabel, money } from "../lib/utils.js";
import { PageHeading } from "../components/common/PageHeading.jsx";
import { Status } from "../components/common/Status.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";

export function TransfersPage({ transfers, user, onReview, onDelete, onNew }) {
  const canDelete = user.role === "manager" || user.role === "admin";
  const canReview = user.role === "supervisor" || user.role === "keeper";
  const hasActions = canDelete || canReview;
  return <>
    <PageHeading eyebrow="PRODUCTION · SECTION MOVEMENT" title="Stock transfers" description="Follow material from the stock keeper through each production section and back to factory stock." actions={["keeper", "supervisor"].includes(user.role) && <button className="primary-button" onClick={onNew}><span>＋</span> New transfer</button>} />
    <div className="flow-strip">{["Netting", "Mending", "Depth Stretching", "Dye", "Length Section", "Packing"].map((section, index) => <div className="flow-step" key={section}><span className="flow-number">0{index + 1}</span><b>{section}</b>{index < 5 && <span className="flow-arrow">→</span>}</div>)}</div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Transfer history</h2><p>Each transfer waits for confirmation from the receiver: the destination section supervisor, or the stock keeper when Section 6 returns material to factory stock. Stock changes only after acceptance.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>ORDER</th><th>MATERIAL</th><th>FROM</th><th>DESTINATION</th><th>QUANTITY</th><th>WORK PERIOD</th><th>REQUESTED BY</th><th>STATUS</th>{hasActions && <th>ACTION</th>}</tr></thead><tbody>{transfers.map((transfer) => {
      const receivesTransfer = user.role === "keeper"
        ? transfer.to_section === 0 && transfer.from_section === 6
        : transfer.to_section === user.sectionId && transfer.from_section === (user.sectionId === 1 ? null : user.sectionId - 1);
      const canReviewTransfer = canReview && transfer.status === "pending" && receivesTransfer;
      const pendingLabel = transfer.status !== "pending" ? undefined : transfer.to_section === 0 ? "Awaiting stock keeper" : "Awaiting supervisor";
      return <tr key={transfer.id}><td>{transfer.order_id ? `${transfer.order_code || `ORD-${String(transfer.order_id).padStart(4, "0")}`} · ${transfer.order_customer}` : "—"}</td><td><b>{transfer.material}</b></td><td>{transfer.from_name || "Factory stock"}</td><td>{transfer.to_section === 0 ? "Stock keeper · Factory stock" : `Section ${transfer.to_section} · ${transfer.to_name}`}</td><td>{money(transfer.quantity)} {transfer.unit}</td><td>{dateLabel(transfer.period_start)}{transfer.period_end && transfer.period_end !== transfer.period_start ? ` – ${dateLabel(transfer.period_end)}` : ""}</td><td>{transfer.requested_by}</td><td><Status status={transfer.status} label={pendingLabel} /></td>{hasActions && <td>{canDelete ? <button className="reject-button" onClick={() => onDelete(transfer.id)}>Delete history</button> : canReviewTransfer ? <div className="row-actions"><button className="approve-button" onClick={() => onReview(transfer.id, "accepted")}>Accept</button><button className="reject-button" onClick={() => onReview(transfer.id, "rejected")}>Reject</button></div> : transfer.note || "—"}</td>}</tr>;
    })}{!transfers.length && <tr><td colSpan={hasActions ? "9" : "8"}><EmptyState text="No transfers yet. Move material to start a production record." /></td></tr>}</tbody></table></div></section>
  </>;
}

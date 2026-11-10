import { dateLabel, money } from "../lib/utils.js";
import { PageHeading } from "../components/common/PageHeading.jsx";
import { Status } from "../components/common/Status.jsx";
import { EmptyState } from "../components/common/EmptyState.jsx";

export function StockAdjustmentsPage({ adjustments, user, onReview }) {
  const canReview = user.role === "manager";
  return <>
    <PageHeading eyebrow="INVENTORY · STOCK CONTROL" title="Stock adjustments" description="Review stock removal requests and track keeper stock additions." />
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Stock adjustment history</h2><p>Keeper additions update stock immediately. Stock removals change inventory only after manager approval.</p></div></div>
      <div className="table-scroll"><table className="data-table">
        <thead><tr><th>DATE</th><th>MATERIAL</th><th>ACTION</th><th>QUANTITY</th><th>REQUESTED BY</th><th>NOTE</th><th>STATUS</th>{canReview && <th>ACTION</th>}</tr></thead>
        <tbody>
          {adjustments.map((adjustment) => <tr key={adjustment.id}>
            <td>{dateLabel(adjustment.created_at)}</td>
            <td><b>{adjustment.material}</b></td>
            <td>{adjustment.action === "add" ? "Stock added" : "Stock removal"}</td>
            <td>{money(adjustment.quantity)} {adjustment.unit}</td>
            <td>{adjustment.requested_by}</td>
            <td>{adjustment.review_note || adjustment.note || "—"}</td>
            <td><Status status={adjustment.status} /></td>
            {canReview && <td>{adjustment.status === "pending" ? <div className="row-actions"><button className="approve-button" onClick={() => onReview(adjustment.id, "approved")}>Approve</button><button className="reject-button" onClick={() => onReview(adjustment.id, "rejected")}>Reject</button></div> : adjustment.reviewed_by_name || "—"}</td>}
          </tr>)}
          {!adjustments.length && <tr><td colSpan={canReview ? 8 : 7}><EmptyState text="No stock adjustments have been recorded." /></td></tr>}
        </tbody>
      </table></div>
    </section>
  </>;
}

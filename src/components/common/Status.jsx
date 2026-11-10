import { statusClass } from "../../lib/utils.js";

export function Status({ status, label }) {
  const labels = { in_production: "In production", manager_pending: "Manager review", admin_pending: "Admin review", ordered: "Ordered", awaiting_receipt: "Awaiting stock count", accepted: "Accepted", rejected: "Rejected", approved: "Approved", recorded: "Recorded", pending: "Pending", completed: "Completed" };
  return <span className={`status-pill status-${statusClass(status)}`}><i />{label || labels[status] || status}</span>;
}

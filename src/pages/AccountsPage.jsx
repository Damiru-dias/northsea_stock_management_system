import { roleName } from "../lib/utils.js";
import { PageHeading } from "../components/common/PageHeading.jsx";

export function AccountsPage({ accounts, factories, sections, factoryView, onReset }) {
  const selectedFactoryId = Number(factoryView);
  const selectedFactory = factories.find((factory) => factory.id === selectedFactoryId);
  const visibleAccounts = accounts.filter((account) => account.factoryId === selectedFactoryId || account.role === "admin");
  return <>
    <PageHeading eyebrow="ADMINISTRATION · ACCESS" title="Accounts" description={`Fixed role-based accounts for ${selectedFactory?.name || "the selected factory"} and the company administrator. Accounts can't be deleted.`} />
    <div className="account-summary"><div key={selectedFactory?.id}><span className="factory-icon">⌂</span><span><b>{selectedFactory?.name}</b><small>{accounts.filter((account) => account.factoryId === selectedFactoryId).length} factory accounts · manager, keeper & supervisors</small></span></div></div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>{selectedFactory?.name || "Factory"} accounts</h2><p>Admins can issue temporary passwords. Users must set a new password at their next login.</p></div><span className="account-count">{visibleAccounts.length} ACCOUNTS</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>PERSON</th><th>FACTORY</th><th>ROLE</th><th>SECTION</th><th>ACCESS</th><th>PASSWORD</th></tr></thead><tbody>{visibleAccounts.map((account) => <tr key={account.id}><td><span className="account-person"><span className="avatar mini-avatar">{account.displayName.split(" ").map((word) => word[0]).slice(0, 2).join("")}</span><b>{account.displayName}</b></span></td><td>{account.factoryName || "All factories"}</td><td>{roleName[account.role]}</td><td>{account.sectionId ? `Section ${account.sectionId} · ${sections.find((section) => section.id === account.sectionId)?.name}` : "—"}</td><td>{account.mustChangePassword ? <span className="status-pill status-pending"><i />Reset required</span> : <span className="access-active"><i /> Active</span>}</td><td>{account.role !== "admin" && <button className="small-action" onClick={() => onReset(account)}>Reset password</button>}</td></tr>)}</tbody></table></div></section>
  </>;
}

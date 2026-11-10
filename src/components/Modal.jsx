import { useEffect, useState } from "react";
import { generateSuggestedPassword, localDateValue, money } from "../lib/utils.js";

export function Modal({ children, onClose }) {
  useEffect(() => {
    function key(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true">{children}</section></div>;
}

export function ModalContent({ type, user, orders, materials, stock, sections, materialToEdit, receiptRequest, resetCredential, temporaryPassword, suggestedPassword, setSuggestedPassword, onSubmit, onPassword, onName }) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState(user.displayName);
  const [confirmation, setConfirmation] = useState("");
  const [meshFractionEnabled, setMeshFractionEnabled] = useState(false);
  const [rows, setRows] = useState([{ materialId: "", quantity: "" }]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedTransferMaterialId, setSelectedTransferMaterialId] = useState("");
  const [selectedTransferDestinationId, setSelectedTransferDestinationId] = useState("");
  const [selectedFormMaterialId, setSelectedFormMaterialId] = useState("");
  const headings = { order: ["NEW CUSTOMER ORDER", "Create an order"], restock: ["PROCUREMENT · REQUEST", "Request materials"], transfer: ["PRODUCTION · MOVEMENT", "Send a stock transfer"], material: ["INVENTORY · MATERIAL SETUP", "Add material"], "material-edit": ["INVENTORY · MATERIAL SETUP", "Edit material"], "stock-add": ["INVENTORY · STOCK ADJUSTMENT", "Add stock"], "stock-remove": ["INVENTORY · STOCK ADJUSTMENT", "Request stock removal"], receipt: ["PROCUREMENT · PHYSICAL CHECK", "Confirm delivery quantity"], "reset-credential": ["ADMIN · PASSWORD RESET", "Temporary password"], "must-change-password": ["SECURITY · REQUIRED ACTION", "Set a new password"], profile: ["YOUR WORKSPACE", "Account settings"] };
  async function submit(event) {
    event.preventDefault(); setBusy(true); setFormError("");
    const form = new FormData(event.currentTarget);
    try {
      if (type === "order") {
        const meshFraction = form.get("meshFraction") || "0";
        await onSubmit(type, { customer: form.get("customer"), pieces: Number(form.get("pieces")), ply: Number(form.get("ply")), meshSize: `${form.get("meshWhole")}${meshFraction === "0" ? "" : ` ${meshFraction}`}`, widthM: Number(form.get("widthM")), lengthM: Number(form.get("lengthM")), dyeColor: form.get("dyeColor"), materials: rows.filter((row) => row.materialId && row.quantity).map((row) => ({ materialId: Number(row.materialId), quantity: Number(row.quantity) })) });
      } else if (type === "restock") {
        await onSubmit(type, { materialId: Number(form.get("materialId")), quantity: Number(form.get("quantity")) });
      } else if (type === "stock-add" || type === "stock-remove") {
        await onSubmit(type, { materialId: Number(form.get("materialId")), quantity: Number(form.get("quantity")), note: form.get("note") });
      } else if (type === "transfer") {
        const from = form.get("fromSection") || (user.role === "supervisor" ? String(user.sectionId) : "factory");
        await onSubmit(type, { materialId: Number(form.get("materialId")), orderId: form.get("orderId") ? Number(form.get("orderId")) : null, fromSection: from === "factory" ? null : Number(from), toSection: Number(form.get("toSection")), quantity: Number(form.get("quantity")), periodStart: form.get("periodStart"), periodEnd: form.get("periodEnd") });
      } else if (type === "material" || type === "material-edit") {
        const sectionIds = form.getAll("sectionIds").map(Number);
        if (!sectionIds.length) {
          setFormError("Select at least one allocated section.");
          return;
        }
        if (type === "material-edit" && !materialToEdit?.unitEditable &&
            form.get("unit") !== materialToEdit.unit &&
            !window.confirm(`Change this material's unit to ${form.get("unit")}? Existing quantities and history will keep their numeric values; they will not be converted.`)) {
          return;
        }
        await onSubmit(type, { name: form.get("name"), category: form.get("category"), unit: form.get("unit"), sectionIds });
      } else if (type === "receipt") {
        await onSubmit(type, { actualQuantity: Number(form.get("actualQuantity")), receiptNote: form.get("receiptNote") });
      } else if (type === "must-change-password") {
        const newPassword = String(form.get("newPassword") || "");
        if (newPassword !== confirmation) {
          setFormError("The new password and confirmation do not match.");
          return;
        }
        await onPassword({ currentPassword: form.get("currentPassword"), newPassword });
      } else if (type === "profile") {
        if (form.get("displayName") !== user.displayName) await onName(form.get("displayName"));
        if (form.get("newPassword")) await onPassword({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
      }
    } catch (error) { setFormError(error.message); } finally { setBusy(false); }
  }
  const selectedOrder = orders.find((order) => String(order.id) === selectedOrderId);
  const eligibleOrderMaterials = (selectedOrder?.materials || []).filter((item) => user.role === "keeper"
    ? item.remainingQuantity > 0
    : item.sectionQuantities?.[user.sectionId] > 0);
  const orderMaterialById = new Map(eligibleOrderMaterials.map((item) => [item.materialId, item]));
  const eligibleMaterials = materials.filter((material) => material.isActive !== false && (type === "transfer"
    ? user.role === "keeper"
      ? (!selectedOrderId || orderMaterialById.has(material.id)) && (material.sectionIds || (material.section_id ? [material.section_id] : [])).length > 0
      : user.role === "supervisor" ? orderMaterialById.has(material.id) : true
    : type === "order" ? material.category !== "Packaging" : true));
  const selectedFormMaterial = materials.find((material) => String(material.id) === selectedFormMaterialId);
  const selectedOrderMaterial = orderMaterialById.get(Number(selectedTransferMaterialId));
  const selectedTransferMaterial = materials.find((material) => material.id === Number(selectedTransferMaterialId));
  const selectedSectionIds = selectedTransferMaterial?.sectionIds || (selectedTransferMaterial?.section_id ? [selectedTransferMaterial.section_id] : []);
  const transferOrders = orders.filter((order) => ["approved", "in_production"].includes(order.status) && order.materials?.some((item) => user.role === "keeper"
    ? item.remainingQuantity > 0
    : item.sectionQuantities?.[user.sectionId] > 0));
  const availableTransferQuantity = user.role === "keeper"
    ? selectedOrderId
      ? selectedOrderMaterial?.remainingQuantity
      : stock.find((item) => item.materialId === selectedTransferMaterial?.id)?.quantity
    : selectedOrderMaterial?.sectionQuantities?.[user.sectionId];
  const transferDestinationSections = user.role === "keeper"
    ? sections.filter((section) => selectedSectionIds.includes(section.id))
    : user.role === "supervisor"
      ? sections.filter((section) => user.sectionId < 6 && section.id === user.sectionId + 1)
      : [];
  return <><div className="modal-heading"><div><div className="eyebrow muted-eyebrow">{headings[type]?.[0]}</div><h2>{headings[type]?.[1]}</h2></div><button className="modal-close" type="button" aria-label="Close dialog" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>×</button></div>
    {type === "reset-credential" ? <div className="modal-form"><p className="modal-description">Give <b>{resetCredential?.account.displayName}</b> the common temporary password below. They must choose a new password immediately after logging in.</p><label htmlFor="temporaryPassword">Common temporary password</label><div className="generated-password"><input id="temporaryPassword" value={resetCredential?.temporaryPassword || ""} readOnly /><button className="secondary-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(resetCredential?.temporaryPassword || ""); setFormError("Temporary password copied."); } catch { setFormError("Clipboard access failed. Select and copy the temporary password manually."); } }}>Copy</button></div>{formError && <div className="form-note" role="status">{formError}</div>}<div className="form-note">The account remains locked to normal workspace actions until its owner chooses a new password.</div><div className="modal-actions"><button className="primary-button" type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>Done</button></div></div>
      : type === "must-change-password" ? <form onSubmit={submit} className="modal-form"><p className="modal-description">An administrator reset your password. Choose a new password before continuing. A strong password suggestion is ready below.</p><label htmlFor="currentPassword">Temporary / current password</label><input id="currentPassword" name="currentPassword" type="password" defaultValue={temporaryPassword} autoComplete="current-password" required /><label htmlFor="suggestedNewPassword">New password suggestion</label><div className="generated-password"><input id="suggestedNewPassword" name="newPassword" type="text" value={suggestedPassword} onChange={(event) => setSuggestedPassword(event.target.value)} minLength="8" autoComplete="new-password" required /><button className="secondary-button" type="button" onClick={() => setSuggestedPassword(generateSuggestedPassword())}>Suggest another</button></div><label htmlFor="confirmNewPassword">Confirm new password</label><input id="confirmNewPassword" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength="8" autoComplete="new-password" required />{formError && <div className="form-error" role="alert">{formError}</div>}<div className="form-note">Your new password is saved securely and the temporary password stops working immediately.</div><div className="modal-actions"><button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button></div></form>
      : type === "profile" ? <form onSubmit={submit} className="modal-form"><p className="modal-description">Update the name shown to your team, or change your account password.</p><label htmlFor="displayName">Your name</label><input id="displayName" name="displayName" value={name} onChange={(event) => setName(event.target.value)} minLength="2" maxLength="80" required /><div className="modal-divider" /><label htmlFor="currentPassword">Current password</label><input id="currentPassword" name="currentPassword" type="password" placeholder="Required to change password" /><label htmlFor="newPassword">New password</label><input id="newPassword" name="newPassword" type="password" minLength="8" placeholder="At least 8 characters" /><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>Cancel</button><button className="primary-button" disabled={busy}>Save changes</button></div><button className="signout-button" type="button" onClick={() => { localStorage.removeItem("northsea-token"); localStorage.removeItem("northsea-user"); localStorage.removeItem("harborline-token"); localStorage.removeItem("harborline-user"); window.location.reload(); }}>Sign out of this account →</button></form>
      : <form onSubmit={submit} className="modal-form">
        {(type === "material" || type === "material-edit") && <><p className="modal-description">{type === "material" ? user.role === "admin" ? "New materials are added to the shared catalog with zero opening stock in all factories. Select every section that may receive this material." : "This material will be available only in your factory. Select every section that may receive it." : "Update the material name, category, unit and allocated sections."}</p><label htmlFor="newMaterialName">Material name</label><input id="newMaterialName" name="name" minLength="2" maxLength="80" placeholder="e.g. Nylon yarn 630" defaultValue={materialToEdit?.name || ""} required /><label htmlFor="newMaterialCategory">Category</label><select id="newMaterialCategory" name="category" required defaultValue={materialToEdit?.category || ""}><option value="">Select category</option><option value="Nylon yarn">Nylon yarn</option><option value="Dye">Dye</option><option value="Packaging">Packaging</option><option value="Other">Other</option></select><label htmlFor="materialUnit">Unit</label><select id="materialUnit" name="unit" defaultValue={materialToEdit?.unit || "kg"} required><option value="kg">Kilograms (kg)</option><option value="pcs">Pieces (pcs)</option><option value="liter">Liters (liter)</option></select>{type === "material-edit" && materialToEdit?.unitEditable === false && <div className="form-note">Changing the unit does not convert existing quantities or history. Confirm when saving to keep the current numeric values with the selected unit.</div>}<div className="section-checkbox-heading">Allocated sections <span className="field-hint">SELECT ONE OR MORE</span></div><div className="section-checkbox-grid" role="group" aria-label="Allocated sections">{sections.map((section) => <label className="section-checkbox" key={section.id}><input type="checkbox" name="sectionIds" value={section.id} defaultChecked={materialToEdit?.sectionIds?.includes(section.id) || false} /><span>Section {section.id} · {section.name}</span></label>)}</div><div className="form-note">Stock keepers can send this material only to the sections selected here.</div></>}
        {type === "receipt" && <><p className="modal-description">Ordered quantity: <b>{money(receiptRequest?.quantity)} {receiptRequest?.unit || "kg"}</b>. Count the delivered material and record the actual amount received.</p><label htmlFor="actualQuantity">Physically counted quantity ({receiptRequest?.unit || "kg"})</label><input id="actualQuantity" name="actualQuantity" type="number" min="0.01" step="0.01" defaultValue={receiptRequest?.quantity} required /><label htmlFor="receiptNote">Receipt note <span className="field-hint">REQUIRED IF QUANTITY DIFFERS</span></label><textarea id="receiptNote" name="receiptNote" rows="3" placeholder="Record shortages, damage, or other count differences." /><div className="form-note">Only the confirmed physical quantity will be added to your factory's stock.</div></>}
        {type === "order" && <>
          <div className="form-grid"><div className="field-span"><label htmlFor="customer">Customer / external party</label><input name="customer" id="customer" placeholder="e.g. Oceanic Fisheries Ltd." required /></div>
          <div><label htmlFor="pieces">Number of pieces</label><input name="pieces" id="pieces" type="number" min="1" placeholder="100" required /></div><div><label htmlFor="ply">Nylon ply <span className="field-hint">MAX 60</span></label><input name="ply" id="ply" type="number" min="1" max="60" placeholder="1 – 60" required /></div>
          <div className="field-span"><label>Mesh size</label><div className="mesh-input"><input name="meshWhole" type="number" min="1" placeholder="4" required /><span className="mesh-inch">inches</span><label className="fraction-toggle"><input type="checkbox" checked={meshFractionEnabled} onChange={(event) => setMeshFractionEnabled(event.target.checked)} /> Add fraction</label>{meshFractionEnabled && <select name="meshFraction" defaultValue="1/2" aria-label="Mesh fraction"><option value="1/4">1/4</option><option value="1/2">1/2</option><option value="3/4">3/4</option></select>}</div></div>
          <div><label htmlFor="widthM">Width (meters)</label><input name="widthM" id="widthM" type="number" min="0.01" step="0.01" placeholder="Width" required /></div><div><label htmlFor="lengthM">Length (meters) <span className="field-hint">MAX 3,000</span></label><input name="lengthM" id="lengthM" type="number" min="0.01" max="3000" step="0.01" placeholder="Length" required /></div>
          <div className="field-span"><label htmlFor="dyeColor">Dye colour <span className="field-hint">REQUIRED WHEN DYE IS ADDED</span></label><input name="dyeColor" id="dyeColor" placeholder="e.g. Ocean blue" /></div></div>
          <div className="material-rows-head"><div><b>Materials required</b><small>Add the quantity needed for this order.</small></div><button type="button" className="add-row-button" onClick={() => setRows([...rows, { materialId: "", quantity: "" }])}>＋ Add material</button></div>
          {rows.map((row, index) => <div className="material-form-row" key={index}><select aria-label="Material" value={row.materialId} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, materialId: event.target.value } : item))} required><option value="">Select material</option>{eligibleMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.unit}</option>)}</select><input aria-label="Material quantity" type="number" min="0.01" step="0.01" placeholder={`Quantity (${materials.find((material) => String(material.id) === row.materialId)?.unit || "unit"})`} value={row.quantity} onChange={(event) => setRows(rows.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} required />{rows.length > 1 && <button type="button" className="remove-row" aria-label="Remove material" onClick={() => setRows(rows.filter((_, i) => i !== index))}>×</button>}</div>)}
          <div className="form-note">Your order will be sent to the factory manager for approval before materials can be issued.</div>
        </>}
        {type === "restock" && <><p className="modal-description">Your factory manager will review this request before it goes to the admin for ordering.</p><label htmlFor="materialId">Material</label><select name="materialId" id="materialId" value={selectedFormMaterialId} onChange={(event) => setSelectedFormMaterialId(event.target.value)} required><option value="">Select material</option>{eligibleMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.unit}</option>)}</select><label htmlFor="quantity">Quantity to request ({selectedFormMaterial?.unit || "unit"})</label><input name="quantity" id="quantity" type="number" min="0.01" step="0.01" placeholder={`Enter quantity (${selectedFormMaterial?.unit || "unit"})`} required /><div className="form-note">When goods arrive, the admin confirms the quantity and factory stock is updated.</div></>}
        {(type === "stock-add" || type === "stock-remove") && <><p className="modal-description">{type === "stock-add" ? "This quantity will be added to your factory stock immediately. No manager approval is required." : "This request will not change stock until your factory manager approves it."}</p><label htmlFor="adjustmentMaterial">Material</label><select name="materialId" id="adjustmentMaterial" value={selectedFormMaterialId} onChange={(event) => setSelectedFormMaterialId(event.target.value)} required><option value="">Select material</option>{eligibleMaterials.map((material) => <option key={material.id} value={material.id}>{material.name} · {material.unit}</option>)}</select><label htmlFor="adjustmentQuantity">Quantity ({selectedFormMaterial?.unit || "unit"})</label><input name="quantity" id="adjustmentQuantity" type="number" min="0.01" step="0.01" placeholder={`Enter quantity (${selectedFormMaterial?.unit || "unit"})`} required /><label htmlFor="adjustmentNote">Note <span className="field-hint">OPTIONAL</span></label><textarea name="note" id="adjustmentNote" rows="3" maxLength="500" placeholder={type === "stock-add" ? "Reason for adding stock" : "Reason for requesting removal"} /></>}
        {type === "transfer" && <>
          <p className="modal-description">{user.role === "keeper" ? "Send factory stock to any section allocated to the material. Link an approved order when the transfer is for a specific job, or leave it unassigned for general supplies." : "Choose the approved order whose material is in your section, then request the next stage handoff. Its supervisor must accept before stock moves."}</p>
          {["keeper", "supervisor"].includes(user.role) && <>
            <label htmlFor="transferOrder">{user.role === "keeper" ? "Order number (optional)" : "Order number"}</label>
            <select name="orderId" id="transferOrder" value={selectedOrderId} onChange={(event) => { setSelectedOrderId(event.target.value); setSelectedTransferMaterialId(""); setSelectedTransferDestinationId(""); }} required={user.role === "supervisor"}>
              <option value="">{user.role === "keeper" ? "General stock transfer (no order)" : "Select order"}</option>
              {transferOrders.map((order) => <option key={order.id} value={order.id}>{order.order_code || `#${order.id}`} · {order.customer}</option>)}
            </select>
          </>}
          <label htmlFor="transferMaterial">Material</label>
          <select name="materialId" id="transferMaterial" value={["keeper", "supervisor"].includes(user.role) ? selectedTransferMaterialId : undefined} onChange={["keeper", "supervisor"].includes(user.role) ? (event) => { setSelectedTransferMaterialId(event.target.value); setSelectedTransferDestinationId(""); } : undefined} required disabled={user.role === "supervisor" && !selectedOrderId}>
            <option value="">Select material</option>
            {eligibleMaterials.map((material) => {
              const orderMaterial = orderMaterialById.get(material.id);
              const quantity = user.role === "keeper" ? orderMaterial?.remainingQuantity : orderMaterial?.sectionQuantities?.[user.sectionId];
              return <option key={material.id} value={material.id}>{material.name} · {material.unit} · Assigned sections: {(material.sectionNames || [material.section_id]).join(", ")}{orderMaterial ? ` · ${money(quantity)} ${material.unit} available` : ""}</option>;
            })}
          </select>
          <label htmlFor="fromSection">Send stock from</label>
          <select name="fromSection" id="fromSection" defaultValue={user.role === "supervisor" ? String(user.sectionId) : "factory"}>
            {user.role !== "supervisor" && <option value="factory">Factory stock</option>}
            {user.role === "supervisor" && <option value={user.sectionId}>Section {user.sectionId} · {sections.find((section) => section.id === user.sectionId)?.name}</option>}
          </select>
          <label htmlFor="toSection">Send to</label>
          <select name="toSection" id="toSection" value={user.role === "keeper" ? selectedTransferDestinationId : user.role === "supervisor" ? String(user.sectionId === sections.length ? 0 : user.sectionId + 1) : ""} onChange={user.role === "keeper" ? (event) => setSelectedTransferDestinationId(event.target.value) : undefined} required disabled={user.role === "keeper" && !selectedTransferMaterialId}>
            <option value="" disabled>Select destination</option>
            {transferDestinationSections.map((section) => <option key={section.id} value={section.id}>Section {section.id} · {section.name}</option>)}
            {user.role === "supervisor" && user.sectionId === sections.length && <option value="0">Stock keeper · Factory stock</option>}
          </select>
          {user.role === "supervisor" && <div className="form-note">{user.sectionId === sections.length ? "The stock keeper must accept this return before it is added to factory stock." : "The next section supervisor must accept this request before stock moves."}</div>}
          {user.role === "keeper" && selectedTransferMaterial && <div className="form-note">Choose any section allocated to this material. Only allocated sections are available.</div>}
          <label htmlFor="transferQuantity">Quantity transferred ({selectedTransferMaterial?.unit || "unit"})</label>
          <input name="quantity" id="transferQuantity" type="number" min="0.01" step="0.01" max={availableTransferQuantity} placeholder={selectedTransferMaterialId ? `Up to ${money(availableTransferQuantity)} ${selectedTransferMaterial?.unit}` : "Enter quantity"} required />
          <div className="form-grid">
            <div><label htmlFor="periodStart">Work period start</label><input id="periodStart" name="periodStart" type="date" defaultValue={localDateValue()} required /></div>
            <div><label htmlFor="periodEnd">Work period end</label><input id="periodEnd" name="periodEnd" type="date" defaultValue={localDateValue()} required /></div>
          </div>
          <div className="form-note">This transfer request will be sent to the receiving user. Source and destination stock update only after the receiver accepts it.</div>
        </>}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : type === "order" ? "Send for approval" : type === "restock" ? "Submit request" : type === "stock-add" ? "Add to stock" : type === "stock-remove" ? "Send removal request" : type === "transfer" ? "Send transfer request" : type === "material" ? "Add material" : type === "material-edit" ? "Save material" : "Confirm receipt"} <span>→</span></button></div>
      </form>}
  </>;
}

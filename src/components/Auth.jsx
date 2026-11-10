import { useState } from "react";
import { request } from "../lib/api.js";

export function Logo({ small = false }) {
  return <div className={`brand-mark${small ? " small" : ""}`} aria-hidden="true"><span>N</span></div>;
}

export function Login({ config, onLogin }) {
  const [factoryId, setFactoryId] = useState("1");
  const [role, setRole] = useState("keeper");
  const [sectionId, setSectionId] = useState("1");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request("/auth/login", { method: "POST", body: JSON.stringify({ factoryId, role, sectionId, password }) });
      onLogin(result, password);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="story-top"><Logo /><span>NORTHSEA <span className="light-word">INDUSTRIES</span></span></div>
        <div className="story-content">
          <div className="eyebrow"><span className="eyebrow-dot" /> OPERATIONS, IN SYNC</div>
          <h1>Every thread<br />has a place.</h1>
          <p>One clear view of materials, production and people — across every factory floor.</p>
        </div>
        <div className="story-footer"><span>BUILT FOR THE WORK BEHIND THE NET</span><span>01 — 03</span></div>
        <div className="line-art" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="mobile-brand"><Logo /><span>NORTHSEA</span></div>
          <div className="form-heading"><span className="eyebrow muted-eyebrow">WELCOME BACK</span><h2>Sign in to your<br />workspace.</h2><p>Select your factory and role to continue.</p></div>
          <form onSubmit={submit}>
            <label htmlFor="factory">Factory</label>
            <div className="select-wrap">
              <select id="factory" value={factoryId} onChange={(event) => { const selectedFactory = event.target.value; setFactoryId(selectedFactory); if (selectedFactory === "admin") setRole("admin"); else if (role === "admin") setRole("manager"); }} disabled={role === "admin"}>
                <option value="admin">Admin</option>
                {config.factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.name} · {factory.location}</option>)}
              </select><span className="select-chevron">⌄</span>
            </div>
            <label htmlFor="role">Account type</label>
            <div className="select-wrap">
              <select id="role" value={role} onChange={(event) => { setRole(event.target.value); setFactoryId(event.target.value === "admin" ? "admin" : "1"); }}>
                <option value="manager">Factory manager</option><option value="keeper">Stock keeper</option><option value="supervisor">Section supervisor</option><option value="admin">Administrator</option>
              </select><span className="select-chevron">⌄</span>
            </div>
            {role === "supervisor" && <>
              <label htmlFor="section">Section</label>
              <div className="select-wrap">
                <select id="section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                  {config.sections.map((section) => <option key={section.id} value={section.id}>Section {section.id} · {section.name}</option>)}
                </select><span className="select-chevron">⌄</span>
              </div>
            </>}
            <label htmlFor="password">Password</label>
            <div className="password-wrap"><input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button className="eye-button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Hide" : "Show"}</button></div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button login-submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <span>→</span></button>
          </form>
          <div className="login-security"><span className="lock-icon">⌑</span> Your factory data stays within your workspace.</div>
        </div>
        <div className="login-bottom">NORTHSEA STOCK MANAGEMENT <span>v1.0</span></div>
      </section>
    </main>
  );
}

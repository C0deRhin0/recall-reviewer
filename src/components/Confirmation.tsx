"use client";
import { useEffect, useState } from "react";

export default function Confirmation() {
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("error"))
      setError(
        "This confirmation link could not be completed. Request a new account confirmation email and try again.",
      );
  }, []);
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          RECALL<span className="brand-period">.</span>
        </a>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <h1>{error ? "Confirmation unavailable" : "Email confirmed"}</h1>
          <p className="subtle">
            {error
              ? error
              : "Your account is ready. Sign in to open your study workspace."}
          </p>
          <a className="button primary wide" href="/">
            Sign in <span>→</span>
          </a>
        </div>
      </section>
    </main>
  );
}

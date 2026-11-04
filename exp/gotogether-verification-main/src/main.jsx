
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ShieldCheck,
  CarFront,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  LockKeyhole,
  ArrowLeft,
  BadgeCheck,
  UserRound,
  FileCheck2,
  LoaderCircle,
  Bell,
} from "lucide-react";
import { enableNotifications } from "./notifications";
import "./style.css";

const SUPABASE_URL =
  import.meta.env.VITE_VERIFICATION_SUPABASE_URL ||
  "https://iqxpcpyquntxqnoxnmxw.supabase.co";

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_VERIFICATION_SUPABASE_ANON_KEY || "";

function App() {
  const [page, setPage] = useState("intro");
  const [name, setName] = useState("");
  const [pan, setPan] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("");

  async function handleEnableNotifications() {
    setNotificationBusy(true);
    setNotificationStatus("");

    try {
      const token = await enableNotifications();

      // The token is deliberately not logged or displayed.
      // Secure backend registration will be added separately.
      if (token) {
        setNotificationStatus(
          "Notifications enabled for this browser. Verification alerts are not connected yet."
        );
      }
    } catch (error) {
      setNotificationStatus(
        error instanceof Error
          ? error.message
          : "Could not enable notifications. Please try again."
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  async function verify(event) {
    event.preventDefault();
    setResult(null);

    if (!consent) {
      setResult({
        ok: false,
        message:
          "Please confirm that you consent to this sandbox verification.",
      });
      return;
    }

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      setResult({
        ok: false,
        message: "Enter a PAN in the format ABCDE1234F.",
      });
      return;
    }

    if (
      !SUPABASE_ANON_KEY ||
      SUPABASE_ANON_KEY.includes("PASTE_YOUR")
    ) {
      setResult({
        ok: false,
        message:
          "Setup needed: configure the public anon/publishable key for your separate verification Supabase project in Vercel environment variables.",
      });
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-pan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            pan: pan.trim().toUpperCase(),
            name: name.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.valid === true) {
        setResult({
          ok: true,
          message: data.message || "PAN verified successfully.",
          registeredName: data.registered_name || name.trim(),
        });
        setPage("result");
      } else {
        setResult({
          ok: false,
          message:
            data.provider_message ||
            data.error ||
            `Verification failed (HTTP ${response.status}).`,
        });
      }
    } catch {
      setResult({
        ok: false,
        message:
          "Could not reach the verification service. Check your internet connection and Supabase function settings.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setPage("intro");
            setResult(null);
          }}
          aria-label="GoTogetherRides home"
        >
          <span className="brand-mark">
            <CarFront size={22} />
          </span>
          <span>
            GoTogether<span className="brand-blue">Rides</span>
            <small>SHARE THE WAY</small>
          </span>
        </button>

        <div className="top-actions">
          <span className="secure-pill">
            <LockKeyhole size={14} /> Secure verification
          </span>
          <div className="avatar">S</div>
        </div>
      </header>

      <main>
        <section
          aria-label="Push notification settings"
          style={{
            maxWidth: 1100,
            margin: "16px auto",
            padding: "0 20px",
          }}
        >
          <button
            type="button"
            className="primary-btn"
            onClick={handleEnableNotifications}
            disabled={notificationBusy}
          >
            {notificationBusy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Bell size={18} />
            )}
            {notificationBusy
              ? "Enabling notifications..."
              : "Enable GoTogetherRides Notifications"}
          </button>

          {notificationStatus && (
            <p role="status" aria-live="polite">
              {notificationStatus}
            </p>
          )}
        </section>

        <div className="breadcrumb">
          <span>Account</span>
          <ChevronRight size={15} />
          <span className="current">Identity verification</span>
        </div>

        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={15} /> TRUST &amp; SAFETY
            </div>
            <h1>
              Travel together.
              <br />
              <span>Verify with confidence.</span>
            </h1>
            <p>
              Help build a safer community by confirming your identity.
              This prototype currently supports PAN verification in
              Cashfree Sandbox.
            </p>
            <div className="hero-points">
              <span>
                <CheckCircle2 size={16} /> Secure verification flow
              </span>
              <span>
                <CheckCircle2 size={16} /> Protected server credentials
              </span>
            </div>
          </div>

          <div className="hero-art">
            <div className="art-circle">
              <ShieldCheck size={76} strokeWidth={1.4} />
            </div>
            <div className="floating-card">
              <BadgeCheck size={19} />
              <span>
                <b>Identity check</b>
                <small>Verification step</small>
              </span>
              <CheckCircle2 className="green" size={20} />
            </div>
            <div className="art-dot dot-one"></div>
            <div className="art-dot dot-two"></div>
          </div>
        </section>

        <section className="content-grid">
          <div className="main-card">
            <div className="step-heading">
              <div>
                <span className="step-label">
                  STEP {page === "intro" ? "1" : "2"} OF 2
                </span>
                <h2>
                  {page === "result"
                    ? "Verification result"
                    : page === "intro"
                    ? "Verify your identity"
                    : "Your PAN details"}
                </h2>
                <p>
                  {page === "intro"
                    ? "Start with your PAN details to verify your identity."
                    : page === "result"
                    ? "Here is the response from the sandbox verification service."
                    : "Enter the details exactly as they appear on your PAN."}
                </p>
              </div>
              <div className="step-icon">
                <FileCheck2 size={23} />
              </div>
            </div>

            <div className="progress">
              <span className="active"></span>
              <span className={page !== "intro" ? "active" : ""}></span>
            </div>

            {page !== "result" ? (
              <form onSubmit={verify}>
                <label htmlFor="full-name">
                  Full name <span>As on PAN</span>
                </label>
                <div className="input-wrap">
                  <UserRound size={18} />
                  <input
                    id="full-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </div>

                <label htmlFor="pan">PAN number</label>
                <div className="input-wrap">
                  <BadgeCheck size={18} />
                  <input
                    id="pan"
                    value={pan}
                    onChange={(event) =>
                      setPan(
                        event.target.value
                          .toUpperCase()
                          .replace(/\s/g, "")
                          .slice(0, 10)
                      )
                    }
                    placeholder="ABCDE1234F"
                    autoComplete="off"
                    maxLength={10}
                    pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                    required
                  />
                  <span className="char-count">{pan.length}/10</span>
                </div>

                <div className="helper">
                  Format: 5 letters, 4 numbers, then 1 letter.
                </div>

                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    I consent to checking the information I submit for
                    this sandbox demonstration.
                  </span>
                </label>

                {result && (
                  <div
                    className={`notice ${result.ok ? "success" : "error"}`}
                    role="status"
                  >
                    <AlertCircle size={18} />
                    <span>{result.message}</span>
                  </div>
                )}

                <button
                  className="primary-btn"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      Verifying…
                    </>
                  ) : (
                    <>
                      Verify PAN securely <ChevronRight size={18} />
                    </>
                  )}
                </button>

                <div className="privacy-note">
                  <LockKeyhole size={15} />
                  <span>
                    Your Cashfree credentials stay on the server. This
                    demo does not save PAN details in a database.
                  </span>
                </div>
              </form>
            ) : (
              <div className="result-panel">
                <div className="result-check">
                  <CheckCircle2 size={35} />
                </div>
                <h3>PAN verified in sandbox</h3>
                <p>{result?.message}</p>
                <div className="result-name">
                  <small>Registered name returned</small>
                  <strong>
                    {result?.registeredName || "Not provided"}
                  </strong>
                </div>
                <button
                  className="primary-btn"
                  onClick={() => {
                    setPage("intro");
                    setResult(null);
                    setPan("");
                    setConsent(false);
                  }}
                >
                  Back to verification <ArrowLeft size={18} />
                </button>
                <p className="disclaimer">
                  Sandbox success is a test response, not proof of a real
                  person's identity.
                </p>
              </div>
            )}
          </div>

          <aside className="side-card">
            <div className="side-title">
              <ShieldCheck size={21} />
              <h3>Why verify?</h3>
            </div>
            <p>
              Identity verification can help create a more trusted
              ride-sharing community.
            </p>

            <div className="benefit">
              <span className="benefit-icon blue">
                <ShieldCheck size={19} />
              </span>
              <div>
                <b>Safety first</b>
                <small>Support safer community interactions.</small>
              </div>
            </div>

            <div className="benefit">
              <span className="benefit-icon purple">
                <LockKeyhole size={19} />
              </span>
              <div>
                <b>Secure processing</b>
                <small>Verification credentials remain server-side.</small>
              </div>
            </div>

            <div className="benefit">
              <span className="benefit-icon green-bg">
                <CheckCircle2 size={19} />
              </span>
              <div>
                <b>Clear status</b>
                <small>See whether the sandbox request succeeds.</small>
              </div>
            </div>

            <div className="side-divider"></div>
            <div className="sandbox-tag">
              <span></span> SANDBOX MODE
            </div>
            <p className="side-foot">
              Use only provider-approved test data. Do not enter real PAN
              or Aadhaar information here.
            </p>
          </aside>
        </section>

        <div className="bottom-banner">
          <LockKeyhole size={17} />
          <span>
            <b>Your privacy matters.</b> This is an independent local
            prototype and is not connected to the original production
            LinQ backend.
          </span>
        </div>
      </main>

      <footer>
        <span>© GoTogetherRides · Prototype</span>
        <span>Built for safer shared journeys</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

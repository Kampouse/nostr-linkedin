/**
 * LoginScreen.tsx — Login with NIP-46, NIP-07, nsec, or npub
 */

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Zap, Key, Eye, EyeOff, Plug, UserCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

function isMobile(): boolean {
  return /Mobi|Android/i.test(navigator.userAgent);
}

type Tab = "signer" | "extension" | "nsec" | "npub";

export default function LoginScreen() {
  const {
    connectUri, startConnect, cancelConnect,
    loginNip07, loginNsec, loginNpub,
    loading, error,
  } = useAuth();

  const [tab, setTab] = useState<Tab>("signer");
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [nip07Available] = useState(() => !!(window as any).nostr);

  useEffect(() => {
    if (!connectUri) return;
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [connectUri]);

  // ── QR pairing screen ──
  if (connectUri) {
    return (
      <div className="login-page">
        <div className="login-nav">
          <div className="login-nav-logo">⟠</div>
        </div>
        <div className="login-main">
          <div className="login-box qr-screen">
            <p className="qr-title">Scan to connect</p>
            <p className="qr-subtitle">
              {elapsed > 0 ? `Waiting... (${elapsed}s)` : "Preparing QR code..."}
            </p>
            <div className="qr-wrapper">
              <QRCodeSVG value={connectUri} size={200} />
            </div>
            <div className="qr-actions">
              <button
                className="btn-outline"
                onClick={() => navigator.clipboard.writeText(connectUri).catch(() => {})}
              >
                Copy URI
              </button>
              {isMobile() && (
                <button className="btn-primary" onClick={() => { window.location.href = connectUri; }}>
                  Open Signer
                </button>
              )}
            </div>
            <button className="btn-ghost" onClick={cancelConnect}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main login ──
  return (
    <div className="login-page">
      <div className="login-nav">
        <div className="login-nav-logo">⟠</div>
      </div>
      <div className="login-main">
        <div className="login-box">
          <h1>Sign in</h1>
          <p className="login-sub">Professional networking, decentralized.</p>

          {error && <div className="error-bar">{error}</div>}

          {/* ── Login method tabs ── */}
          <div className="login-tabs">
            <button className={`login-tab${tab === "signer" ? " active" : ""}`} onClick={() => setTab("signer")}>
              <Zap size={16} /> Signer
            </button>
            {nip07Available && (
              <button className={`login-tab${tab === "extension" ? " active" : ""}`} onClick={() => setTab("extension")}>
                <Plug size={16} /> Extension
              </button>
            )}
            <button className={`login-tab${tab === "nsec" ? " active" : ""}`} onClick={() => setTab("nsec")}>
              <Key size={16} /> nsec
            </button>
            <button className={`login-tab${tab === "npub" ? " active" : ""}`} onClick={() => setTab("npub")}>
              <UserCircle size={16} /> npub
            </button>
          </div>

          {/* ── NIP-46 Signer ── */}
          {tab === "signer" && (
            <div className="login-method">
              <p className="login-method-desc">
                Scan a QR code with your Nostr signer app (Clave, Amber, Primal, etc.) via NIP-46 remote signing.
              </p>
              <button className="login-connect-btn" onClick={startConnect} disabled={loading}>
                <Zap size={20} />
                Connect with Signer
              </button>
            </div>
          )}

          {/* ── NIP-07 Extension ── */}
          {tab === "extension" && (
            <div className="login-method">
              <p className="login-method-desc">
                Use your browser extension (Alby, nos2x, etc.) to sign in with NIP-07.
              </p>
              <button className="login-connect-btn" onClick={loginNip07} disabled={loading}>
                <Plug size={20} />
                Connect with Extension
              </button>
            </div>
          )}

          {/* ── nsec ── */}
          {tab === "nsec" && (
            <div className="login-method">
              <p className="login-method-desc">
                Enter your private key (nsec). Full read+write access. Key stays in browser memory.
              </p>
              <div className="key-input-row">
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="nsec1... or hex"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="key-input"
                />
                <button className="key-toggle" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                className="login-connect-btn"
                disabled={!keyInput.trim() || loading}
                onClick={() => loginNsec(keyInput.trim())}
              >
                <Key size={20} />
                Sign in with Key
              </button>
            </div>
          )}

          {/* ── npub (read-only) ── */}
          {tab === "npub" && (
            <div className="login-method">
              <p className="login-method-desc">
                Enter your public key (npub) for read-only access. Browse feeds, profiles, and jobs without signing.
              </p>
              <div className="key-input-row">
                <input
                  type="text"
                  placeholder="npub1... or hex"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="key-input"
                />
              </div>
              <button
                className="login-connect-btn"
                disabled={!keyInput.trim() || loading}
                onClick={() => loginNpub(keyInput.trim())}
              >
                <UserCircle size={20} />
                Browse (Read-Only)
              </button>
            </div>
          )}

          <p className="login-hint">
            {tab === "signer"
              ? <>Uses NIP-46 remote signing. Your keys never leave your signer app.</>
              : tab === "nsec"
              ? <>⚠️ Your key is stored in browser memory. Use a signer app for better security.</>
              : tab === "npub"
              ? <>Read-only mode — you can browse but not post or edit your profile.</>
              : <>Your extension handles all signing — no keys stored here.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

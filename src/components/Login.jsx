import React, { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const LoginComponent = ({ onLogin, initialError = "" }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await onLogin({ username, password });
      if (rememberMe) {
        localStorage.setItem("bot_remember_user", "true");
        localStorage.setItem("bot_last_username", username);
      } else {
        localStorage.removeItem("bot_remember_user");
        localStorage.removeItem("bot_last_username");
      }
      setPassword("");
    } catch (loginError) {
      setError(loginError.message || "Login gagal. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  // Load remembered username
  React.useEffect(() => {
    const rememberUser = localStorage.getItem("bot_remember_user");
    const lastUsername = localStorage.getItem("bot_last_username");

    if (rememberUser === "true" && lastUsername) {
      setUsername(lastUsername);
    }
  }, []);

  return (
    <div className="login-split">
      <aside className="login-showcase">
        <div className="login-brand-row">
          <span className="login-brand-badge" aria-hidden="true">L</span>
          <div className="login-brand-text">
            <strong>Bot Automation</strong>
            <small>E-Kinerja SKP Workspace</small>
          </div>
        </div>

        <div className="login-hero">
          <span className="login-eyebrow">
            <i className="fas fa-bolt" aria-hidden="true"></i>
            Otomatisasi Rencana Aksi SKP
          </span>
          <h1>Kelola rencana aksi bulanan lebih cepat &amp; tertata.</h1>
          <p>
            Satu workspace untuk memantau progres tiap bulan, menambah rencana
            aksi, mengisi realisasi beserta bukti dukung, hingga mengirim
            pengajuan.
          </p>

          <div className="login-preview-widget" aria-hidden="true">
            <div className="login-preview-top">
              <span>Progres SKP Bulanan</span>
              <span className="login-preview-pill">Siap Diajukan</span>
            </div>
            <div className="login-preview-rows">
              <div className="login-preview-row">
                <span>Januari</span>
                <div className="login-preview-bar"><i style={{ width: "100%" }}></i></div>
                <strong>100%</strong>
              </div>
              <div className="login-preview-row">
                <span>Februari</span>
                <div className="login-preview-bar"><i style={{ width: "100%" }}></i></div>
                <strong>100%</strong>
              </div>
              <div className="login-preview-row">
                <span>Maret</span>
                <div className="login-preview-bar"><i style={{ width: "75%" }}></i></div>
                <strong>75%</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="login-foot">
          JMT © {new Date().getFullYear()} Bot Automation System
        </div>
      </aside>

      <main className="login-form-area">
        <div className="login-top-actions">
          <ThemeToggle />
        </div>

        <div className="login-form-center">
          <div className="saas-card login-card">
            <div className="login-mobile-brand">
              <span className="login-brand-badge is-accent" aria-hidden="true">L</span>
              <strong>Bot Automation</strong>
            </div>

            <h2>Selamat Datang</h2>
            <p className="login-sub">
              Masuk dengan akun operator untuk melanjutkan.
            </p>

            {error && (
              <div className="saas-alert saas-alert-danger" role="alert">
                <div className="saas-alert-content">
                  <i className="fas fa-exclamation-triangle" aria-hidden="true"></i>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="saas-field">
                <label htmlFor="login-username">Username</label>
                <div className="saas-input-wrap">
                  <i className="fas fa-user" aria-hidden="true"></i>
                  <input
                    id="login-username"
                    type="text"
                    placeholder="Masukkan username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>

              <div className="saas-field">
                <label htmlFor="login-password">Password</label>
                <div className="saas-input-wrap has-trailing">
                  <i className="fas fa-lock" aria-hidden="true"></i>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="saas-input-trailing"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
                  </button>
                </div>
              </div>

              <label className="saas-checkbox" htmlFor="rememberMe">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Ingat username saya (sesi 2 jam)</span>
              </label>

              <button type="submit" className="saas-btn saas-btn-primary saas-btn-block" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <span className="saas-spinner" aria-hidden="true"></span>
                    <span>Masuk...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-sign-in-alt" aria-hidden="true"></i>
                    <span>Masuk</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginComponent;

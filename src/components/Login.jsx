import React, { useState } from "react";

const LoginComponent = ({ onLogin, initialError = "" }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div
      className="d-flex justify-content-center align-items-center position-relative"
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Background Pattern */}
      <div
        className="position-absolute w-100 h-100"
        style={{
          backgroundImage: `
            radial-gradient(circle at 25% 25%, rgba(var(--theme-accent-rgb), 0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(var(--theme-accent-rgb), 0.05) 0%, transparent 50%)
          `,
          zIndex: 1,
        }}
      />

      {/* Login Card */}
      <div
        className="position-relative"
        style={{ zIndex: 2, minWidth: "400px", maxWidth: "450px" }}
      >
        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-4 shadow-lg position-relative overflow-hidden"
          style={{
            background: "rgba(42, 42, 42, 0.95)",
            border: "1px solid rgba(var(--theme-accent-rgb), 0.2)",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Glow Effect */}
          <div
            className="position-absolute top-0 start-0 w-100 h-100"
            style={{
              background:
                "linear-gradient(45deg, rgba(var(--theme-accent-rgb), 0.05) 0%, transparent 50%)",
              zIndex: -1,
            }}
          />

          {/* Header */}
          <div className="text-center mb-4">
            <div
              className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
              style={{
                width: "80px",
                height: "80px",
                background:
                  "linear-gradient(135deg, rgba(var(--theme-accent-rgb), 0.2) 0%, rgba(var(--theme-accent-rgb), 0.1) 100%)",
                border: "2px solid rgba(var(--theme-accent-rgb), 0.3)",
              }}
            >
              <span className="app-monogram" aria-hidden="true">L</span>
            </div>
            <h3
              className="mb-2"
              style={{
                color: "var(--theme-accent)",
                fontWeight: "600",
                textShadow: "0 0 10px rgba(var(--theme-accent-rgb), 0.3)",
              }}
            >
              Bot Automation
            </h3>
            <p
              className="mb-0 small"
              style={{
                color: "rgba(255, 255, 255, 0.7)",
                letterSpacing: "0.5px",
              }}
            >
              Masuk untuk melanjutkan
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              className="alert mb-4 rounded-3 border-0"
              style={{
                background: "rgba(253, 3, 28, 0.8)",
                border: "1px solid rgba(220, 53, 70, 0.8)",
                color: "#ff6b6b",
              }}
            >
              <i className="fas fa-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}

          {/* Username Input */}
          <div className="mb-4">
            <label
              className="form-label small"
              style={{ color: "rgba(255, 255, 255, 0.8)" }}
            >
              Username
            </label>
            <div className="position-relative">
              <i
                className="fas fa-user position-absolute"
                style={{
                  left: "15px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(var(--theme-accent-rgb), 0.6)",
                  zIndex: 2,
                }}
              ></i>
              <input
                type="text"
                className="form-control ps-5 py-3 rounded-3 border-0"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(var(--theme-accent-rgb), 0.2)",
                  color: "#fff",
                  fontSize: "1rem",
                }}
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                onFocus={(e) =>
                  (e.target.style.border = "1px solid rgba(var(--theme-accent-rgb), 0.5)")
                }
                onBlur={(e) =>
                  (e.target.style.border = "1px solid rgba(var(--theme-accent-rgb), 0.2)")
                }
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="mb-4">
            <label
              className="form-label small"
              style={{ color: "rgba(255, 255, 255, 0.8)" }}
            >
              Password
            </label>
            <div className="position-relative">
              <i
                className="fas fa-lock position-absolute"
                style={{
                  left: "15px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(var(--theme-accent-rgb), 0.6)",
                  zIndex: 2,
                }}
              ></i>
              <input
                type="password"
                className="form-control ps-5 py-3 rounded-3 border-0"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(var(--theme-accent-rgb), 0.2)",
                  color: "#fff",
                  fontSize: "1rem",
                }}
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                onFocus={(e) =>
                  (e.target.style.border = "1px solid rgba(var(--theme-accent-rgb), 0.5)")
                }
                onBlur={(e) =>
                  (e.target.style.border = "1px solid rgba(var(--theme-accent-rgb), 0.2)")
                }
              />
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div className="mb-4 d-flex align-items-center">
            <input
              type="checkbox"
              className="form-check-input me-2"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                borderColor: "rgba(var(--theme-accent-rgb), 0.3)",
              }}
            />
            <label
              className="form-check-label small"
              htmlFor="rememberMe"
              style={{ color: "rgba(255, 255, 255, 0.7)" }}
            >
              Ingat saya (sesi 2 jam)
            </label>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            className="btn w-100 py-3 rounded-3 border-0 position-relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-dark) 100%)",
              color: "#1a1a1a",
              fontSize: "1.1rem",
              fontWeight: "600",
              letterSpacing: "0.5px",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 20px rgba(var(--theme-accent-rgb), 0.3)",
            }}
            disabled={isLoading}
            onMouseEnter={(e) => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 8px 30px rgba(var(--theme-accent-rgb), 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 20px rgba(var(--theme-accent-rgb), 0.3)";
            }}
          >
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Masuk...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt me-2"></i>
                Masuk
              </>
            )}
          </button>

          {/* Footer */}
          <div className="text-center mt-4">
            <small style={{ color: "rgba(255, 255, 255, 0.5)" }}>
              JMT © 2025 Bot Automation System
            </small>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginComponent;

import React, { useState, useEffect } from "react";
import LoginComponent from "./components/Login";
import TambahComponent from "./components/Tambah";
import IsiComponent from "./components/SimpanRenaksi";
import AjukanComponent from "./components/Ajukan";
import PreviewComponent from "./components/Preview";
import WorkflowDashboard from "./components/WorkflowDashboard";
import AccountSelector from "./components/AccountSelector";
import { dataUser, showMessage } from "./data/userData";
import { API_CREDENTIALS, API_ENDPOINTS } from "./config/api";
import { clearUserMappingCache } from "./services/mappingService";
import { summarizeIsiResult } from "./utils/isiResult";
import "./styles.css";

const SESSION_DURATION = 120;

const clearStoredSession = () => {
  localStorage.removeItem("bot_login_time");
  localStorage.removeItem("bot_session_duration");
  localStorage.removeItem("bot_authenticated");
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");
  const [accountSelectorState, setAccountSelectorState] = useState({
    query: "",
    unitFilter: "",
    categoryFilter: "",
    open: true,
  });

  // Session configuration (dalam menit)

  // State untuk tab aktif dan loading
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isLoading, setIsLoading] = useState(false);
  const [mappingRevision, setMappingRevision] = useState(0);
  const [message, setMessage] = useState(null);
  const currentYear = new Date().getFullYear();

  // State untuk form data yang berbeda untuk setiap komponen
  const [formData, setFormData] = useState({
    // Tambah form
    unit_t: "",
    kategori_t: "",
    user_t: "",
    bulan_t: "",
    tupoksi: "",
    id_skp_t: "",
    tahun: currentYear,

    // Isi form
    unit: "",
    kategori: "",
    user: "",
    bulan: "",
    jumlahUnikIndikatorKinerja: "",
    bukti_dukung: "",
    rhk: "",

    // Ajukan form
    unit_a: "",
    kategori_a: "",
    user_a: "",
    bulan_a: "",
    id_skp_a: "",

    // Preview form
    unit_p: "",
    kategori_p: "",
    user_p: "",
    bulan_p: "",
  });

  // Clear message after some time
  useEffect(() => {
    if (message && !message.persistent) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Handler untuk mengubah tab aktif
  const handleTabChange = (tab) => {
    // console.log('📋 Tab changed to:', tab);
    setActiveTab(tab);
    setMessage(null); // Clear message saat berganti tab
  };

  const handleIdentityChange = ({ unit, category, user }) => {
    setFormData((previous) => {
      const identityChanged =
        previous.unit !== unit ||
        previous.kategori !== category ||
        previous.user !== user;

      return {
        ...previous,
        unit_t: unit,
        unit,
        unit_a: unit,
        unit_p: unit,
        kategori_t: category,
        kategori: category,
        kategori_a: category,
        kategori_p: category,
        user_t: user,
        user,
        user_a: user,
        user_p: user,
        ...(identityChanged
          ? {
              bulan_t: "",
              bulan: "",
              bulan_a: "",
              bulan_p: "",
              tupoksi: "",
              id_skp_t: "",
              id_skp_a: "",
              jumlahUnikIndikatorKinerja: "",
              bukti_dukung: "",
              rhk: "",
            }
          : {}),
      };
    });
  };

  const refreshUserMapping = (username) => {
    clearUserMappingCache(username);
    setMappingRevision((revision) => revision + 1);
  };

  // Handler untuk submit Tambah Rencana Aksi
  const handleTambahSubmit = async (payload) => {
    setIsLoading(true);
    try {
      const formBody = new URLSearchParams(payload).toString();

      const response = await fetch(API_ENDPOINTS.TAMBAH_RENAKSI, {
        method: "POST",
        credentials: API_CREDENTIALS,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: formBody,
      });

      const result = await response.json();
      const isSuccess =
        response.ok &&
        (result?.success === true ||
          String(result?.status || "").toLowerCase() === "success");

      if (isSuccess) {
        setMessage({
          text: "Rencana Aksi Berhasil Ditambahkan",
          type: "success",
        });
        showMessage("Rencana Aksi Berhasil Ditambahkan", "success");
        refreshUserMapping(payload.username);
      } else {
        const errorMsg =
          result?.message || `Permintaan gagal (HTTP ${response.status}).`;
        setMessage({ text: "Gagal: " + errorMsg, type: "danger" });
        showMessage("Gagal: " + errorMsg, "danger", 8000);
      }
    } catch (error) {
      console.error("Error submitting tambah:", error);
      setMessage({
        text: "Gagal mengirim data: " + error.message,
        type: "danger",
      });
      showMessage("Gagal mengirim data: " + error.message, "danger", 8000);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler untuk submit Isi Rencana Aksi
  const handleIsiSubmit = async (payload) => {
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.ISI_RENAKSI, {
        method: "POST",
        credentials: API_CREDENTIALS,
        body: payload, // FormData object
      });

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error("Respons server tidak valid. Silakan coba lagi.");
      }

      const plans = JSON.parse(payload.get("rhk"));
      if (!Array.isArray(plans)) throw new Error("Data RHK tidak valid.");
      const summary = summarizeIsiResult(result, plans.length, response.ok);
      const text = summary.success
        ? "Rencana Aksi Berhasil di Isi"
        : "Rencana aksi belum seluruhnya berhasil disimpan.";
      setMessage({
        text,
        type: summary.success ? "success" : "danger",
        summary,
        persistent: true,
      });
      showMessage(text, summary.success ? "success" : "danger", 8000);
    } catch (error) {
      console.error("Error submitting isi:", error);
      let msg = error.message || "Gagal mengirim data!";
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        msg = "Gagal mengirim data! (network error)";
      }
      setMessage({ text: msg, type: "danger" });
      showMessage(msg, "danger", 8000);
    } finally {
      refreshUserMapping(payload.get("username"));
      setIsLoading(false);
    }
  };

  // Handler untuk submit Ajukan Rencana Aksi
  const handleAjukanSubmit = async (payload) => {
    setIsLoading(true);
    try {
      const formBody = new URLSearchParams(payload).toString();

      const response = await fetch(API_ENDPOINTS.AJUKAN_RENAKSI, {
        method: "POST",
        credentials: API_CREDENTIALS,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: formBody,
      });

      const result = await response.json();

      const isSuccess =
        response.ok &&
        (result?.success === true ||
          String(result?.status || "").toLowerCase() === "success");

      if (isSuccess) {
        setMessage({ text: "Rencana Aksi Berhasil Diajukan", type: "success" });
        showMessage("Rencana Aksi Berhasil Diajukan", "success");
        refreshUserMapping(payload.username);
      } else {
        const errorMessage =
          result?.message || `Permintaan gagal (HTTP ${response.status}).`;
        setMessage({
          text: "Ajukan gagal: " + errorMessage,
          type: "danger",
        });
        showMessage("Ajukan gagal: " + errorMessage, "danger", 8000);
      }
    } catch (error) {
      console.error("Error submitting ajukan:", error);
      const errorMsg = "Request error: " + error.message;
      setMessage({ text: errorMsg, type: "danger" });
      showMessage(errorMsg, "danger", 8000);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let authenticated = false;
    try {
      const loginTime = Number(localStorage.getItem("bot_login_time"));
      const duration = Number(localStorage.getItem("bot_session_duration"));
      authenticated =
        Number.isFinite(loginTime) &&
        loginTime > 0 &&
        Number.isFinite(duration) &&
        duration > 0 &&
        Date.now() < loginTime + duration * 60 * 1000;

      if (!authenticated) clearStoredSession();
    } catch (error) {
      console.error("Error checking local session:", error);
      setAuthError("Tidak dapat memeriksa sesi pada browser ini.");
    }
    setIsAuthenticated(authenticated);
    setIsCheckingAuth(false);
  }, []);

  const handleLogin = async ({ username, password }) => {
    const expectedUsername = import.meta.env.VITE_LOGIN_USERNAME;
    const expectedPassword = import.meta.env.VITE_LOGIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      throw new Error("Login belum dikonfigurasi pada file .env.");
    }

    if (username !== expectedUsername || password !== expectedPassword) {
      throw new Error("Username atau password salah.");
    }

    try {
      localStorage.setItem("bot_login_time", String(Date.now()));
      localStorage.setItem("bot_session_duration", String(SESSION_DURATION));
    } catch (error) {
      console.error("Error storing local session metadata:", error);
    }

    setIsAuthenticated(true);
    setAuthError("");
  };

  const handleLogout = () => {
    clearUserMappingCache();
    if (API_ENDPOINTS.LOGOUT) {
      fetch(API_ENDPOINTS.LOGOUT, {
        method: "POST",
        credentials: API_CREDENTIALS,
      }).catch((error) => {
        console.error("Gagal mengakhiri sesi API Node:", error);
      });
    }
    clearStoredSession();
    setAccountSelectorState({ query: "", unitFilter: "", categoryFilter: "", open: true });
    setIsAuthenticated(false);
  };

  const activeTabTitle = {
    dashboard: "Ringkasan Progres",
    tambah: "Tambah Renaksi",
    isi: "Isi Rencana Aksi",
    ajukan: "Kirim Renaksi",
    preview: "Preview Renaksi",
  }[activeTab];

  // Show loading screen while checking session
  if (isCheckingAuth) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "100vh", background: "#1a1a1a" }}
      >
        <div className="text-center" style={{ color: "var(--theme-accent)" }}>
          <div className="spinner-border mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p>Memeriksa sesi...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginComponent onLogin={handleLogin} initialError={authError} />;
  }

  const accountSelector = (
    <AccountSelector
      dataUser={dataUser}
      selection={{ unit: formData.unit, category: formData.kategori, user: formData.user }}
      onIdentityChange={handleIdentityChange}
      state={accountSelectorState}
      onStateChange={setAccountSelectorState}
    />
  );

  return (
    <div className="automation-shell">
      {/* Fixed message container */}
      <div className="message-container" id="message-container"></div>

      <aside className="automation-sidebar">
        <div className="automation-brand">
          <span className="automation-brand-mark" aria-hidden="true">
            <span className="app-monogram">L</span>
          </span>
          <span className="automation-brand-copy">
            <strong>Bot Automation</strong>
            <small>Rencana Aksi SKP</small>
          </span>
        </div>

        <nav className="automation-navigation" aria-label="Rencana Aksi">
          <div className="automation-nav-label">MENU UTAMA</div>
          {[
            { id: "dashboard", label: "Ringkasan Progres", mobileLabel: "Progres", icon: "fa-chart-pie" },
            { id: "tambah", label: "Tambah Renaksi", mobileLabel: "Tambah", icon: "fa-circle-plus" },
            { id: "isi", label: "Isi Rencana Aksi", mobileLabel: "Isi", icon: "fa-pen-to-square" },
            { id: "ajukan", label: "Kirim Renaksi", mobileLabel: "Kirim", icon: "fa-paper-plane" },
            { id: "preview", label: "Preview Renaksi", mobileLabel: "Preview", icon: "fa-eye" },
          ].map((item) => (
            <button
              className={`automation-nav-link ${activeTab === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              aria-label={item.label}
              aria-current={activeTab === item.id ? "page" : undefined}
              data-mobile-label={item.mobileLabel}
              title={item.label}
              onClick={() => handleTabChange(item.id)}
            >
              <i className={`fas ${item.icon}`} aria-hidden="true"></i>
              <span data-mobile-label={item.mobileLabel}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="automation-sidebar-bottom">
          <button
            className="automation-sidebar-action"
            type="button"
            aria-label="Lihat sisa sesi"
            data-mobile-label="Sesi"
            onClick={() => {
              const remaining = getRemainingTime();
              alert(`Sesi berakhir dalam: ${remaining}`);
            }}
            title="Lihat sisa sesi"
          >
            <i className="fas fa-clock" aria-hidden="true"></i>
            <span data-mobile-label="Sesi">Sesi</span>
          </button>
          <button
            className="automation-sidebar-action logout"
            type="button"
            aria-label="Logout"
            data-mobile-label="Logout"
            onClick={handleLogout}
            title="Logout"
          >
            <i className="fas fa-sign-out-alt" aria-hidden="true"></i>
            <span data-mobile-label="Logout">Logout</span>
          </button>
        </div>
      </aside>

      <main className="automation-main">
        <header className="automation-topbar">
          <div>
            <div className="automation-breadcrumb">E-KINERJA <span>/</span> RENCANA AKSI</div>
            <h1>{activeTabTitle}</h1>
          </div>
          <div className="automation-status">
            <span className="automation-status-dot"></span>
            <span>Sistem aktif</span>
          </div>
        </header>

        <section className="automation-content">
          <div id="main-content">
            <div hidden={activeTab !== "dashboard"}>
              <WorkflowDashboard
                dataUser={dataUser}
                selection={{
                  unit: formData.unit,
                  category: formData.kategori,
                  user: formData.user,
                }}
                mappingRevision={mappingRevision}
                onNavigate={handleTabChange}
                accountSelector={activeTab === "dashboard" ? accountSelector : null}
              />
            </div>

            <div hidden={activeTab !== "tambah"}>
              <TambahComponent
                dataUser={dataUser}
                onSubmit={handleTambahSubmit}
                isLoading={isLoading}
                formData={formData}
                setFormData={setFormData}
                message={message}
                onIdentityChange={handleIdentityChange}
                mappingRevision={mappingRevision}
                accountSelector={activeTab === "tambah" ? accountSelector : null}
              />
            </div>

            <div hidden={activeTab !== "isi"}>
              <IsiComponent
                dataUser={dataUser}
                onSubmit={handleIsiSubmit}
                isLoading={isLoading}
                formData={formData}
                setFormData={setFormData}
                message={message}
                onIdentityChange={handleIdentityChange}
                mappingRevision={mappingRevision}
                accountSelector={activeTab === "isi" ? accountSelector : null}
              />
            </div>

            <div hidden={activeTab !== "ajukan"}>
              <AjukanComponent
                dataUser={dataUser}
                onSubmit={handleAjukanSubmit}
                isLoading={isLoading}
                formData={formData}
                setFormData={setFormData}
                message={message}
                onIdentityChange={handleIdentityChange}
                mappingRevision={mappingRevision}
                accountSelector={activeTab === "ajukan" ? accountSelector : null}
              />
            </div>

            <div hidden={activeTab !== "preview"}>
              <PreviewComponent
                dataUser={dataUser}
                formData={formData}
                setFormData={setFormData}
                onIdentityChange={handleIdentityChange}
                mappingRevision={mappingRevision}
                accountSelector={activeTab === "preview" ? accountSelector : null}
              />
            </div>
          </div>
        </section>

        <footer className="automation-footer">
          <span><i className="fas fa-code" aria-hidden="true"></i> Design &amp; Created By JMT</span>
          <span>© {currentYear} Bot Automation</span>
        </footer>
      </main>
    </div>
  );

  // Helper function to get remaining time
  function getRemainingTime() {
    try {
      const loginTime = localStorage.getItem("bot_login_time");
      const sessionDuration = localStorage.getItem("bot_session_duration");

      if (loginTime && sessionDuration) {
        const currentTime = new Date().getTime();
        const loginTimestamp = parseInt(loginTime);
        const duration = parseInt(sessionDuration) * 60 * 1000;
        const remainingMs = loginTimestamp + duration - currentTime;

        if (remainingMs > 0) {
          const remainingMinutes = Math.floor(remainingMs / 60000);
          const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);
          return `${remainingMinutes}m ${remainingSeconds}s`;
        }
      }
      return "Expired";
    } catch {
      return "Error";
    }
  }
};

export default App;

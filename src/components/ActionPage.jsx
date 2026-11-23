import React, { useEffect, useRef, useState } from "react";
import { useUi } from "../context/UiContext";

/**
 * Dialog konfirmasi SaaS yang aksesibel (Escape menutup, fokus awal ke tombol konfirmasi).
 */
function ConfirmDialog({ title, body, confirmLabel, variant, onConfirm, onCancel }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="saas-backdrop" onMouseDown={onCancel}>
      <div
        className="saas-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ui-dialog-title"
        aria-describedby="ui-dialog-body"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="saas-dialog-head">
          <div className="saas-dialog-title-wrap">
            <span className="saas-dialog-icon" aria-hidden="true">
              <i className="fas fa-circle-question"></i>
            </span>
            <h3 id="ui-dialog-title">{title}</h3>
          </div>
          <button
            type="button"
            className="saas-icon-btn"
            aria-label="Tutup"
            onClick={onCancel}
          >
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className="saas-dialog-body" id="ui-dialog-body">
          {body}
        </div>

        <div className="saas-dialog-foot">
          <button type="button" className="saas-btn saas-btn-ghost" onClick={onCancel}>
            Batal
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={`saas-btn saas-btn-${variant === "success" ? "success" : "primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Kerangka halaman aksi (Tambah / Isi / Ajukan / Preview).
 */
export default function ActionPage({
  icon,
  title,
  subtitle,
  steps,
  hasUser,
  monthSelector,
  monthLabel,
  action,
  canSubmit,
  isSubmitting,
  onSubmit,
  confirm,
  mappingError,
  onRetry,
  message,
  children,
}) {
  const { activeAccount, openAccountPanel } = useUi();
  const [confirming, setConfirming] = useState(false);

  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    if (confirm) setConfirming(true);
    else onSubmit(event);
  };

  const runConfirmed = () => {
    setConfirming(false);
    onSubmit({ preventDefault() {} });
  };

  const summary = [activeAccount?.name, monthLabel].filter(Boolean);

  return (
    <div className="action-page">
      <div className="page-head-bar">
        <div className="page-head">
          <h2>
            <span className="page-head-icon" aria-hidden="true">
              <i className={`fas ${icon}`}></i>
            </span>
            <span>{title}</span>
          </h2>
          <p>{subtitle}</p>
        </div>

        {steps && (
          <ol className="step-list" aria-label="Langkah">
            {steps.map((step, index) => (
              <li
                key={step}
                className={
                  index === 0 && !hasUser
                    ? "current"
                    : index === 0
                      ? "done"
                      : index === 1 && hasUser && !monthLabel
                        ? "current"
                        : index === 1 && monthLabel
                          ? "done"
                          : index === 2 && hasUser && monthLabel
                            ? "current"
                            : ""
                }
              >
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>

      {!hasUser ? (
        <div className="saas-alert saas-alert-info" role="status">
          <div className="saas-alert-content">
            <i className="fas fa-circle-info" aria-hidden="true"></i>
            <span>Silakan pilih pegawai pada kartu <strong>Pilih Pegawai</strong> di atas terlebih dahulu.</span>
          </div>
          <button type="button" className="saas-btn saas-btn-primary saas-btn-sm" onClick={openAccountPanel}>
            <i className="fas fa-arrow-up" aria-hidden="true"></i>
            <span>Fokus ke Pencarian</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleFormSubmit} autoComplete="off" noValidate>
          <div className="saas-card saas-card-pad">
            {monthSelector}
          </div>

          {mappingError && (
            <div className="saas-alert saas-alert-danger" role="alert">
              <div className="saas-alert-content">
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <span>{mappingError}</span>
              </div>
              <button type="button" className="saas-btn saas-btn-ghost saas-btn-sm" onClick={onRetry}>
                Coba lagi
              </button>
            </div>
          )}

          <div className="action-bar">
            <div className="action-bar-summary">
              <span className="action-bar-label">Dipilih</span>
              <strong>
                {summary.length ? summary.join(" · ") : "Belum ada bulan dipilih"}
              </strong>
            </div>
            <button
              type="submit"
              className={`saas-btn saas-btn-${action.variant === "success" ? "success" : "primary"}`}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="saas-spinner" aria-hidden="true"></span>
                  <span>{action.busyLabel}</span>
                </>
              ) : (
                <>
                  <i className={`fas ${action.icon}`} aria-hidden="true"></i>
                  <span>{action.label}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {message?.summary && (
        <div
          className={`saas-alert ${message.type === "success" ? "saas-alert-success" : "saas-alert-danger"} saas-alert-block`}
          role="status"
        >
          <i
            className={`fas ${message.type === "success" ? "fa-circle-check" : "fa-circle-exclamation"}`}
            aria-hidden="true"
          ></i>
          <div className="saas-alert-details">
            <strong>{message.text}</strong>
            <div>
              Berhasil: {message.summary.successCount}/{message.summary.expected} (awal:{" "}
              {message.summary.initialSuccessCount}, retry: {message.summary.retrySuccessCount}).
            </div>
            <div>
              {message.summary.retryDetails.length
                ? `Retry: ${message.summary.retrySuccessCount} berhasil, ${message.summary.retryFailureCount} gagal.`
                : "Retry: tidak ada."}
            </div>
            {message.summary.retryDetails.length > 0 && (
              <ul>
                {message.summary.retryDetails.map((retry, index) => (
                  <li key={index}>
                    ID {retry.id}, {retry.field}, percobaan {retry.attempt}:{" "}
                    {retry.success ? "berhasil" : "gagal"}
                    {retry.httpCode ? ` (HTTP ${retry.httpCode})` : ""}.
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {children}

      {confirming && confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={
            <>
              <p className="saas-dialog-copy">{confirm.body}</p>
              {summary.length > 0 && (
                <div className="saas-dialog-summary">{summary.join(" · ")}</div>
              )}
            </>
          }
          confirmLabel={confirm.confirmLabel || action.label}
          variant={action.variant || "primary"}
          onConfirm={runConfirmed}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

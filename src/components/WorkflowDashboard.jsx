import { useEffect, useMemo, useState } from "react";
import { useUi } from "../context/UiContext";
import { fetchUserMapping } from "../services/mappingService";
import { getWorkflowMonthStatuses } from "../utils/workflowStatus";
import { getSkpDetails, getSkpMonthNumbers } from "../utils/skpPage";

const displayValue = (value) =>
  typeof value === "string" && value.trim() ? value : "Tidak tersedia";

const displayDate = (value) => {
  if (!value) return "Tidak tersedia";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Tanggal tidak valid";
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return "Tanggal tidak valid";
  }
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(date);
};

const MonthRatings = ({ ratings }) => (
  <div className="workflow-ratings">
    {(ratings.length ? ratings : [{}]).map((rating, index) => (
      <dl className="workflow-rating" key={index}>
        <div><dt>Rating hasil kerja</dt><dd>{displayValue(rating.work)}</dd></div>
        <div><dt>Rating perilaku kerja</dt><dd>{displayValue(rating.behavior)}</dd></div>
        <div><dt>Predikat</dt><dd>{displayValue(rating.predicate)}</dd></div>
      </dl>
    ))}
  </div>
);

const WorkflowDashboard = ({
  dataUser,
  selection,
  mappingRevision,
  onNavigate,
}) => {
  const [monthStatuses, setMonthStatuses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");

  const selectedAccount = useMemo(() => {
    const accounts = dataUser[selection.unit]?.[selection.category];
    if (!accounts) return null;
    return Object.entries(accounts).find(
      ([, account]) => account.username === selection.user,
    )?.[1] || null;
  }, [dataUser, selection.category, selection.unit, selection.user]);

  useEffect(() => {
    let isCurrent = true;

    if (!selection.user) {
      setMonthStatuses([]);
      setError("");
      setDetails(null);
      setDetailsError("");
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    if (!selectedAccount) {
      setMonthStatuses([]);
      setError("Data akun pengguna tidak lengkap.");
      setDetails(null);
      setDetailsError("");
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    const loadStatuses = async () => {
      setIsLoading(true);
      setError("");
      setDetails(null);
      setDetailsError("");
      try {
        const mapping = await fetchUserMapping({
          unit: selection.unit,
          category: selection.category,
          username: selection.user,
        });
        const statuses = getWorkflowMonthStatuses(
          mapping.raw_response,
          mapping.year,
          getSkpMonthNumbers(mapping.period, mapping.year),
        );
        let skpDetails;
        let skpDetailsError = "";
        try {
          skpDetails = getSkpDetails(mapping.raw_response, mapping.id_skp);
        } catch (detailError) {
          skpDetailsError = detailError.message || "Detail SKP tidak dapat dibaca.";
        }
        if (isCurrent) {
          setMonthStatuses(statuses);
          setDetails(skpDetails || null);
          setDetailsError(skpDetailsError);
        }
      } catch (loadError) {
        if (isCurrent) {
          setMonthStatuses([]);
          setError(loadError.message || "Gagal memuat status rencana aksi.");
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadStatuses();
    return () => {
      isCurrent = false;
    };
  }, [
    mappingRevision,
    retryCount,
    selectedAccount,
    selection.category,
    selection.unit,
    selection.user,
  ]);

  const { openAccountPanel } = useUi();

  const totals = monthStatuses.reduce(
    (result, month) => {
      result.months += 1;
      result[month.status] = (result[month.status] || 0) + 1;
      return result;
    },
    { months: 0 },
  );

  const accountName = Object.entries(
    dataUser[selection.unit]?.[selection.category] || {},
  ).find(([, account]) => account.username === selection.user)?.[0];

  const actionNeededCount =
    (totals.missing || 0) +
    (totals["needs-renaksi"] || 0) +
    (totals["needs-fill"] || 0);
  const readyCount = totals.ready || 0;
  const submittedCount = (totals.pending || 0) + (totals.done || 0);
  const recordedCount = totals.months - (totals.missing || 0);

  const filteredMonths = monthStatuses.filter((month) => {
    if (statusFilter === "action") {
      return ["missing", "needs-renaksi", "needs-fill"].includes(month.status);
    }
    if (statusFilter === "ready") return month.status === "ready";
    if (statusFilter === "done") return ["pending", "done"].includes(month.status);
    return true;
  });

  return (
    <div className="workflow-dashboard">
      <div className="workflow-dashboard-heading">
        <div>
          <h2>Progres Rencana Aksi</h2>
          <p>
            {selection.user
              ? `Menampilkan status bulanan untuk ${accountName || selection.user}.`
              : "Pantau status bulanan dan langsung lanjut ke langkah berikutnya."}
          </p>
        </div>
        <div className="workflow-heading-meta">
          {isLoading && (
            <span className="saas-loading-pill" role="status">
              <span className="saas-spinner" aria-hidden="true"></span>
              <span>Memuat data...</span>
            </span>
          )}
          <span className="workflow-year">
            <i className="fas fa-calendar" aria-hidden="true"></i>
            <span>{new Date().getFullYear()}</span>
          </span>
        </div>
      </div>

      {!selection.user && (
        <div className="saas-alert saas-alert-info" role="status">
          <div className="saas-alert-content">
            <i className="fas fa-circle-info" aria-hidden="true"></i>
            <span>Pilih pegawai pada kartu <strong>Pilih Pegawai</strong> di atas untuk melihat progres bulanan.</span>
          </div>
          <button type="button" className="saas-btn saas-btn-primary saas-btn-sm" onClick={openAccountPanel}>
            <i className="fas fa-arrow-up" aria-hidden="true"></i>
            <span>Fokus ke Pencarian</span>
          </button>
        </div>
      )}

      {selection.user && (
        <section className="workflow-status-section">

          {error && (
            <div className="saas-alert saas-alert-danger" role="alert">
              <div className="saas-alert-content">
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <span>{error}</span>
              </div>
              <button
                type="button"
                className="saas-btn saas-btn-ghost saas-btn-sm"
                onClick={() => setRetryCount((current) => current + 1)}
              >
                Coba lagi
              </button>
            </div>
          )}

          {isLoading && (
            <>
              <div className="kpi-grid" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div className="skeleton skeleton-kpi" key={index}></div>
                ))}
              </div>
              <div className="workflow-month-grid" aria-hidden="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="skeleton skeleton-card" key={index}></div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !error && monthStatuses.length > 0 && (
            <>
              {/* KPI Stat Cards */}
              <div className="kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-icon tone-accent">
                    <i className="fas fa-calendar-check" aria-hidden="true"></i>
                  </span>
                  <div>
                    <div className="kpi-label">Bulan Tercatat</div>
                    <div className="kpi-value">{recordedCount} <small>/ {totals.months}</small></div>
                  </div>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon tone-warn">
                    <i className="fas fa-pen-to-square" aria-hidden="true"></i>
                  </span>
                  <div>
                    <div className="kpi-label">Perlu Tindakan</div>
                    <div className="kpi-value">{actionNeededCount}</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon tone-info">
                    <i className="fas fa-paper-plane" aria-hidden="true"></i>
                  </span>
                  <div>
                    <div className="kpi-label">Siap Diajukan</div>
                    <div className="kpi-value">{readyCount}</div>
                  </div>
                </div>
                <div className="kpi-card">
                  <span className="kpi-icon tone-success">
                    <i className="fas fa-circle-check" aria-hidden="true"></i>
                  </span>
                  <div>
                    <div className="kpi-label">Sudah Diajukan</div>
                    <div className="kpi-value">{submittedCount}</div>
                  </div>
                </div>
              </div>

              {detailsError && (
                <div className="saas-alert saas-alert-warning" role="alert">
                  <div className="saas-alert-content">
                    <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                    <span>Detail SKP tidak tersedia: {detailsError}</span>
                  </div>
                </div>
              )}

              {details && (
                <section className="saas-card workflow-skp-details" aria-label="Detail SKP">
                  <h3>
                    <i className="fas fa-id-card" aria-hidden="true"></i>
                    <span>Detail SKP</span>
                  </h3>
                  <dl>
                    <div><dt>Nama pegawai</dt><dd>{displayValue(details.name)}</dd></div>
                    <div><dt>NIP</dt><dd>{displayValue(details.nip)}</dd></div>
                    <div><dt>Jabatan</dt><dd>{displayValue(details.position)}</dd></div>
                    <div><dt>Unit kerja</dt><dd>{displayValue(details.unit)}</dd></div>
                    <div><dt>Periode SKP</dt><dd>{displayDate(details.startDate)} - {displayDate(details.endDate)}</dd></div>
                  </dl>
                </section>
              )}

              {/* Filter Pills */}
              <div className="saas-pills" role="group" aria-label="Filter status bulan">
                {[
                  { id: "all", label: "Semua Bulan", count: monthStatuses.length },
                  { id: "action", label: "Perlu Tindakan", count: actionNeededCount },
                  { id: "ready", label: "Siap Diajukan", count: readyCount },
                  { id: "done", label: "Sudah Diajukan", count: submittedCount },
                ].map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={`saas-pill ${statusFilter === tab.id ? "active" : ""}`}
                    onClick={() => setStatusFilter(tab.id)}
                  >
                    <span>{tab.label}</span>
                    <em className="saas-pill-count">{tab.count}</em>
                  </button>
                ))}
              </div>

              {filteredMonths.length === 0 ? (
                <div className="saas-empty-note">
                  Tidak ada bulan pada kategori ini.
                </div>
              ) : (
                <div className="workflow-month-grid">
                  {filteredMonths.map((month) => (
                    <article
                      className={`workflow-month-card ${month.status}`}
                      key={month.monthNumber}
                    >
                      <div className="workflow-month-card-heading">
                        <strong>{month.monthLabel}</strong>
                        <span className="workflow-status-pill">{month.label}</span>
                      </div>
                      {month.status === "missing" ? (
                        <>
                          <div className="workflow-month-detail workflow-missing-detail">
                            {month.action ? "Belum ada data indikator." : month.blockedReason}
                          </div>
                          <MonthRatings ratings={month.ratings} />
                          <button
                            type="button"
                            className="workflow-next-action"
                            disabled={!month.action}
                            onClick={() => onNavigate(month.action)}
                          >
                            <span>Tambah rencana aksi</span>
                            <i className="fas fa-arrow-right" aria-hidden="true"></i>
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="workflow-progress">
                            <span
                              style={{
                                width: `${month.total ? Math.round((month.filled / month.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          <div className="workflow-month-detail workflow-month-row">
                            <span>{month.filled} / {month.total} indikator</span>
                            <strong>
                              {month.total ? Math.round((month.filled / month.total) * 100) : 0}%
                            </strong>
                          </div>
                          <MonthRatings ratings={month.ratings} />
                          <button
                            type="button"
                            className="workflow-next-action"
                            onClick={() => onNavigate(month.action)}
                          >
                            <span>
                              {month.action === "preview"
                                ? "Lihat detail"
                                : `Lanjut ${month.action === "tambah" ? "tambah" : month.action === "isi" ? "isi" : "ajukan"}`}
                            </span>
                            <i className="fas fa-arrow-right" aria-hidden="true"></i>
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

        </section>
      )}
    </div>
  );
};

export default WorkflowDashboard;

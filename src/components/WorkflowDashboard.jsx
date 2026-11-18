import { useEffect, useMemo, useState } from "react";
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
  accountSelector,
}) => {
  const [monthStatuses, setMonthStatuses] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [detailsError, setDetailsError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

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

  return (
    <div className="workflow-dashboard">
      <div className="workflow-dashboard-heading">
        <div>
          <div className="workflow-eyebrow">RINGKASAN</div>
          <h2>Progres Rencana Aksi</h2>
          <p>Pantau status bulanan dan lanjutkan ke langkah berikutnya.</p>
        </div>
        <span className="workflow-year">{new Date().getFullYear()}</span>
      </div>

      {accountSelector}

      {selection.user && (
        <section className="workflow-status-section">
          <div className="workflow-status-heading">
            <div>
              <h3>Status Bulanan</h3>
              <p>{accountName || selection.user}</p>
            </div>
            {isLoading && (
              <span className="workflow-loading">
                <span className="spinner-border spinner-border-sm" role="status"></span>
                Memuat
              </span>
            )}
          </div>

          {error && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                className="btn btn-outline-light btn-sm"
                onClick={() => setRetryCount((current) => current + 1)}
              >
                Coba lagi
              </button>
            </div>
          )}

          {!isLoading && !error && monthStatuses.length > 0 && (
            <>
              {detailsError && (
                <div className="alert alert-warning" role="alert">
                  Detail SKP tidak tersedia: {detailsError}
                </div>
              )}
              {details && (
                <section className="workflow-skp-details" aria-label="Detail SKP">
                  <h3>Detail SKP</h3>
                  <dl>
                    <div><dt>Nama pegawai</dt><dd>{displayValue(details.name)}</dd></div>
                    <div><dt>NIP</dt><dd>{displayValue(details.nip)}</dd></div>
                    <div><dt>Jabatan</dt><dd>{displayValue(details.position)}</dd></div>
                    <div><dt>Unit kerja</dt><dd>{displayValue(details.unit)}</dd></div>
                    <div><dt>Periode SKP</dt><dd>{displayDate(details.startDate)} - {displayDate(details.endDate)}</dd></div>
                  </dl>
                </section>
              )}
              <div className="workflow-summary-counts">
                <span>{totals.months - (totals.missing || 0)} bulan tercatat</span>
                <span>{totals.missing || 0} belum ada data</span>
                <span>{totals["needs-renaksi"] || 0} perlu ditambahkan</span>
                <span>{totals["needs-fill"] || 0} perlu diisi</span>
                <span>{totals.ready || 0} siap diajukan</span>
                <span>{(totals.pending || 0) + (totals.done || 0)} sudah diajukan</span>
              </div>
              <div className="workflow-month-grid">
                {monthStatuses.map((month) => (
                  <article
                    className={`workflow-month-card ${month.status}`}
                    key={month.monthNumber}
                  >
                    <div className="workflow-month-card-heading">
                      <strong>{month.monthLabel}</strong>
                      <span>{month.label}</span>
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
                          Tambah rencana aksi
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
                        <div className="workflow-month-detail">
                          {month.filled} dari {month.total} indikator terisi
                        </div>
                        <MonthRatings ratings={month.ratings} />
                        <button
                          type="button"
                          className="workflow-next-action"
                          onClick={() => onNavigate(month.action)}
                        >
                          {month.action === "preview"
                            ? "Lihat detail"
                            : `Lanjut ${month.action === "tambah" ? "tambah" : month.action === "isi" ? "isi" : "ajukan"}`}
                          <i className="fas fa-arrow-right" aria-hidden="true"></i>
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

        </section>
      )}
    </div>
  );
};

export default WorkflowDashboard;

import { groupMonthOptions } from "../utils/monthOptions";

export default function MonthSelector({
  id,
  options,
  value,
  onChange,
  disabled,
  isLoading,
  monthNumbers,
}) {
  const visibleOptions = disabled || isLoading ? [] : options;
  const selected = visibleOptions.find(
    (option) => String(option.value) === String(value) && value !== "",
  );
  const { months, otherOptions } = groupMonthOptions(visibleOptions);
  const visibleMonths = isLoading
    ? []
    : monthNumbers
      ? months.filter((_, index) => monthNumbers.includes(index + 1))
      : disabled ? months : [];

  const renderOption = (option, monthLabel, key) => {
    const unavailable = option.disabled || String(option.value) === "";
    const isSelected = selected === option;
    const status = option.label.slice(monthLabel.length).replace(/^ - /, "");

    return (
      <button
        type="button"
        key={key}
        className={`month-option${isSelected ? " selected" : ""}`}
        disabled={unavailable}
        aria-pressed={isSelected}
        onClick={() => onChange(String(option.value))}
      >
        <span className="month-option-top">
          <strong>{monthLabel}</strong>
          {isSelected ? (
            <i className="fas fa-circle-check" aria-label="Terpilih"></i>
          ) : !unavailable ? (
            <span className="month-dot" aria-hidden="true"></span>
          ) : null}
        </span>
        {status && <span className="month-option-status">{status}</span>}
      </button>
    );
  };

  return (
    <section id={id} className="month-selector" aria-label="Pilih bulan" aria-busy={isLoading}>
      <div className="month-header">
        <div>
          <div className="month-title">
            <i className="fas fa-calendar-days" aria-hidden="true"></i>
            <span>Pilih Bulan</span>
          </div>
          <p className="month-subtitle">
            {isLoading
              ? "Memuat data bulan dari E-Kinerja..."
              : disabled
                ? "Pilih pegawai terlebih dahulu."
                : selected?.label || "Klik salah satu bulan yang tersedia di bawah ini."}
          </p>
        </div>
        {isLoading && (
          <span className="saas-loading-pill" role="status">
            <span className="saas-spinner" aria-hidden="true"></span>
            <span>Memuat</span>
          </span>
        )}
      </div>

      {otherOptions.map((option, index) =>
        option.value === "" ? (
          <div key={index} className="saas-alert saas-alert-neutral" role="status">
            <i className="fas fa-circle-info" aria-hidden="true"></i>
            <span>{option.label}</span>
          </div>
        ) : null,
      )}

      <div className="month-grid">
        {isLoading &&
          Array.from({ length: 6 }, (_, index) => (
            <div className="skeleton skeleton-month" key={`sk-${index}`} aria-hidden="true"></div>
          ))}
        {visibleMonths.map((month) =>
          month.options.length > 0 ? (
            <div className="month-option-group" key={month.label}>
              {month.options.map((option, index) =>
                renderOption(option, month.label, index),
              )}
            </div>
          ) : (
            <button type="button" className="month-option" key={month.label} disabled>
              <span className="month-option-top">
                <strong>{month.label}</strong>
              </span>
              {!isLoading && <span className="month-option-status">Tidak tersedia</span>}
            </button>
          ),
        )}
        {otherOptions.map((option, index) =>
          option.value !== "" ? renderOption(option, option.label, `other-${index}`) : null,
        )}
      </div>
    </section>
  );
}

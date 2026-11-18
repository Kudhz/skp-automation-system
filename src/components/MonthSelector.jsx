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
        <strong>{monthLabel}</strong>
        {status && <span>{status}</span>}
        {isSelected && <i className="fas fa-check" aria-label="Terpilih"></i>}
      </button>
    );
  };

  return (
    <section id={id} className="month-selector" aria-label="Pilih bulan" aria-busy={isLoading}>
      <div className="account-selector-heading">
        <div>
          <strong>Bulan</strong>
          <p>
            {isLoading
              ? "Memuat data pengguna..."
              : disabled
                ? "Pilih pengguna terlebih dahulu."
                : selected?.label || "Pilih bulan untuk melanjutkan."}
          </p>
        </div>
        {isLoading && (
          <span className="workflow-loading" role="status">
            <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
            Memuat
          </span>
        )}
      </div>
      {otherOptions.map((option, index) =>
        option.value === "" ? (
          <p key={index} className="month-option-message" role="status">{option.label}</p>
        ) : null,
      )}
      <div className="month-grid">
        {visibleMonths.map((month) =>
          month.options.length > 0 ? (
            <div className="month-option-group" key={month.label}>
              {month.options.map((option, index) =>
                renderOption(option, month.label, index),
              )}
            </div>
          ) : (
            <button type="button" className="month-option" key={month.label} disabled>
              <strong>{month.label}</strong>
              {!isLoading && <span>Tidak tersedia</span>}
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

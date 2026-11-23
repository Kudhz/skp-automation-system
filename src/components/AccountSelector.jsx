import { useMemo } from "react";

/**
 * Pemilih pegawai bergaya SaaS di bagian atas workspace:
 * - Belum memilih: langsung terbuka dengan search, segmented kategori, pil unit, dan grid pegawai.
 * - Sudah memilih: meringkas jadi strip pegawai aktif dengan tombol "Ganti Pegawai".
 */
export default function AccountSelector({
  dataUser,
  selection,
  onIdentityChange,
  state,
  onStateChange,
  sectionRef,
  searchInputRef,
}) {
  const { query, unitFilter, categoryFilter, open } = state;
  const updateState = (changes) =>
    onStateChange((current) => ({ ...current, ...changes }));

  const accounts = useMemo(
    () =>
      Object.entries(dataUser).flatMap(([unit, categories]) =>
        Object.entries(categories).flatMap(([category, users]) =>
          Object.entries(users)
            .filter(([, account]) => account.username)
            .map(([name, account]) => ({
              unit,
              category,
              name,
              username: account.username,
            })),
        ),
      ),
    [dataUser],
  );

  const units = useMemo(() => Object.keys(dataUser), [dataUser]);

  const categories = useMemo(
    () => [
      ...new Set(
        accounts
          .filter((account) => !unitFilter || account.unit === unitFilter)
          .map((account) => account.category),
      ),
    ],
    [accounts, unitFilter],
  );

  const results = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            (!unitFilter || account.unit === unitFilter) &&
            (!categoryFilter || account.category === categoryFilter) &&
            account.name
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((left, right) =>
          left.name.localeCompare(right.name, "id", { sensitivity: "base" }),
        ),
    [accounts, unitFilter, categoryFilter, query],
  );

  const selected = accounts.find(
    (account) =>
      account.unit === selection.unit &&
      account.category === selection.category &&
      account.username === selection.user,
  );

  const isExpanded = open || !selected;
  const hasFilters = Boolean(query || unitFilter || categoryFilter);

  return (
    <section
      ref={sectionRef}
      className={`saas-card account-card ${selected ? "is-selected" : "is-prompt"}`}
      aria-label="Pilih pegawai"
    >
      <div className="account-header">
        <div className="account-identity">
          <div
            className={`account-avatar ${selected ? "is-filled" : "is-empty"}`}
            aria-hidden="true"
          >
            {selected ? (
              selected.name.slice(0, 1).toUpperCase()
            ) : (
              <i className="fas fa-user-check"></i>
            )}
          </div>

          <div className="account-identity-text">
            <div className="account-eyebrow">
              {selected ? (
                <>
                  <span className="status-live-dot" aria-hidden="true"></span>
                  <span>PEGAWAI AKTIF</span>
                </>
              ) : (
                "LANGKAH 1 · PILIH PEGAWAI"
              )}
            </div>
            {selected ? (
              <div className="account-active-row">
                <strong className="account-active-name">{selected.name}</strong>
                <span className="saas-tag saas-tag-accent">{selected.unit}</span>
                <span className="saas-tag">{selected.category}</span>
              </div>
            ) : (
              <p className="account-subtitle">
                Pilih unit kerja atau ketik nama pegawai di bawah untuk memulai.
              </p>
            )}
          </div>
        </div>

        {selected && (
          <button
            type="button"
            className="saas-btn saas-btn-ghost saas-btn-sm"
            aria-expanded={isExpanded}
            aria-controls="account-search-panel"
            onClick={() => updateState({ open: !isExpanded })}
          >
            <i
              className={`fas ${isExpanded ? "fa-chevron-up" : "fa-repeat"}`}
              aria-hidden="true"
            ></i>
            <span>{isExpanded ? "Tutup Daftar" : "Ganti Pegawai"}</span>
          </button>
        )}
      </div>

      {isExpanded && (
        <div id="account-search-panel" className="account-panel">
          <div className="account-toolbar">
            <div className="saas-search-box">
              <i className="fas fa-search" aria-hidden="true"></i>
              <input
                ref={searchInputRef}
                id="account-search"
                type="search"
                placeholder="Ketik nama pegawai..."
                aria-label="Cari nama pegawai"
                value={query}
                onChange={(event) => updateState({ query: event.target.value })}
              />
            </div>

            <div className="account-toolbar-right">
              <div className="saas-segmented" role="group" aria-label="Filter kategori">
                <button
                  type="button"
                  className={!categoryFilter ? "active" : ""}
                  onClick={() => updateState({ categoryFilter: "" })}
                >
                  Semua
                </button>
                {categories.map((category) => (
                  <button
                    type="button"
                    key={category}
                    className={categoryFilter === category ? "active" : ""}
                    onClick={() => updateState({ categoryFilter: category })}
                  >
                    {category}
                  </button>
                ))}
              </div>
              {hasFilters && (
                <button
                  type="button"
                  className="saas-link-btn"
                  onClick={() =>
                    updateState({ query: "", unitFilter: "", categoryFilter: "" })
                  }
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="saas-pills" role="group" aria-label="Filter unit kerja">
            <button
              type="button"
              className={`saas-pill ${!unitFilter ? "active" : ""}`}
              onClick={() => updateState({ unitFilter: "", categoryFilter: "" })}
            >
              <span>Semua Unit</span>
              <em className="saas-pill-count">{accounts.length}</em>
            </button>
            {units.map((unit) => {
              const count = accounts.filter((a) => a.unit === unit).length;
              return (
                <button
                  type="button"
                  key={unit}
                  className={`saas-pill ${unitFilter === unit ? "active" : ""}`}
                  onClick={() => updateState({ unitFilter: unit, categoryFilter: "" })}
                >
                  <span>{unit}</span>
                  <em className="saas-pill-count">{count}</em>
                </button>
              );
            })}
          </div>

          <div className="account-count" aria-live="polite">
            {results.length
              ? `${results.length} pegawai tersedia — klik nama untuk memilih`
              : "Tidak ada pegawai yang cocok dengan pencarian."}
          </div>

          <div className="account-user-grid">
            {results.map((account) => {
              const isCurrent = selected === account;
              return (
                <button
                  type="button"
                  key={`${account.unit}-${account.category}-${account.name}`}
                  className={`account-user-tile${isCurrent ? " active" : ""}`}
                  onClick={() => {
                    onIdentityChange({
                      unit: account.unit,
                      category: account.category,
                      user: account.username,
                    });
                    updateState({ open: false, query: "" });
                  }}
                >
                  <span className="account-tile-avatar" aria-hidden="true">
                    {account.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="account-tile-meta">
                    <strong>{account.name}</strong>
                    <small>{account.unit} · {account.category}</small>
                  </span>
                  {isCurrent && (
                    <i className="fas fa-circle-check account-tile-check" aria-label="Terpilih"></i>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

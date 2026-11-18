import { useMemo } from "react";

export default function AccountSelector({
  dataUser, selection, onIdentityChange, state, onStateChange,
}) {
  const { query, unitFilter, categoryFilter, open } = state;
  const updateState = (changes) => onStateChange((current) => ({ ...current, ...changes }));

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
  const categories = [...new Set(
    accounts.filter((account) => !unitFilter || account.unit === unitFilter)
      .map((account) => account.category),
  )];
  const results = accounts
    .filter(
      (account) =>
        (!unitFilter || account.unit === unitFilter) &&
        (!categoryFilter || account.category === categoryFilter) &&
        account.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .sort((left, right) => left.name.localeCompare(right.name, "id", { sensitivity: "base" }));
  const selected = accounts.find(
    (account) =>
      account.unit === selection.unit &&
      account.category === selection.category &&
      account.username === selection.user,
  );

  return (
    <section className="account-selector" aria-label="Pilih pengguna">
      <div className="account-selector-heading">
        <div>
          <strong>Pengguna aktif</strong>
          <p>
            {selected
              ? `${selected.name} · ${selected.unit} · ${selected.category}`
              : "Pilih pengguna untuk memulai."}
          </p>
        </div>
        <button
          type="button"
          className="account-toggle"
          aria-expanded={open}
          aria-controls="account-search-panel"
          onClick={() => updateState({ open: !open })}
        >
          <i className={`fas ${open ? "fa-xmark" : "fa-user-pen"}`} aria-hidden="true"></i>
          {open ? "Tutup" : selected ? "Ganti" : "Pilih pengguna"}
        </button>
      </div>
      {open && (
        <div id="account-search-panel" className="account-search-panel">
          <div className="account-filters">
            <div className="account-search-field">
              <label htmlFor="account-search">Cari pengguna</label>
              <input
                id="account-search"
                className="form-control"
                type="search"
                placeholder="Ketik nama pengguna"
                value={query}
                onChange={(event) => updateState({ query: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="account-unit-filter">Unit kerja</label>
              <select id="account-unit-filter" className="form-select" value={unitFilter} onChange={(event) => {
                updateState({ unitFilter: event.target.value, categoryFilter: "" });
              }}>
                <option value="">Semua unit</option>
                {Object.keys(dataUser).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="account-category-filter">Kategori</label>
              <select id="account-category-filter" className="form-select" value={categoryFilter} onChange={(event) => updateState({ categoryFilter: event.target.value })}>
                <option value="">Semua kategori</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          </div>
          <p className="account-results-count" aria-live="polite">
            {results.length ? `${results.length} pengguna ditemukan` : "Tidak ada pengguna yang cocok."}
          </p>
          <div className="account-results">
            {results.map((account) => (
              <button
                type="button"
                key={`${account.unit}-${account.category}-${account.name}`}
                className="account-result"
                onClick={() => {
                  onIdentityChange({ unit: account.unit, category: account.category, user: account.username });
                  updateState({ open: false, query: "" });
                }}
              >
                <span><strong>{account.name}</strong><small>{account.unit} · {account.category}</small></span>
                {selected === account && <i className="fas fa-check" aria-label="Terpilih"></i>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

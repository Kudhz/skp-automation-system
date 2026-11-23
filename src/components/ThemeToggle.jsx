import React, { useEffect, useState } from "react";

const STORAGE_KEY = "bot_theme";

const getInitialTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
};

// Apply as early as possible to avoid a flash of wrong theme
applyTheme(getInitialTheme());

const ThemeToggle = ({ className = "" }) => {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className={`saas-theme-btn ${className}`.trim()}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
    >
      <i className={`fas ${isDark ? "fa-sun" : "fa-moon"}`} aria-hidden="true"></i>
      <span className="saas-theme-label">{isDark ? "Terang" : "Gelap"}</span>
    </button>
  );
};

export default ThemeToggle;

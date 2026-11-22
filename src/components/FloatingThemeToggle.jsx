import { useEffect, useState } from "react";

const STORAGE_KEY = "amg-library-theme";

function getInitialTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "light" ? saved : "light";
  } catch {
    return "light";
  }
}

export function FloatingThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme still works for this session when storage is unavailable.
    }
  }, [theme]);

  const nextTheme = theme === "light" ? "dark" : "light";
  return (
    <button
      className="amg-theme-float"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      <span className="amg-theme-float-icon" aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span>
      <span className="amg-theme-float-label">{theme === "light" ? "Dark" : "Light"}</span>
    </button>
  );
}

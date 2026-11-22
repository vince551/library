import { createRoot } from "react-dom/client";
import "../amg-design-system.css";
import "../amg-glassmorphism.css";
import "./styles/catalogue.css";
import "./styles/premium-responsive.css";
import "./styles/librarian-workspace.css";
import "./styles/theme-system.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.error("AMG Library service worker registration failed:", error);
    });
  });
}

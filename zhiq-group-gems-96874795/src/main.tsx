import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

/**
 * 🔥 SINAL DE BOOTSTRAP (CRÍTICO)
 * Informa à plataforma (Lovable) que o app React já montou.
 * Isso remove o loader estático de 69%.
 */
window.dispatchEvent(new Event("app:mounted"));
(window as any).__APP_MOUNTED__ = true;

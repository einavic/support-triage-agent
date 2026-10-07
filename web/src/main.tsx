import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Entry point: find the <div id="root"> in index.html and render the App component into it.
// StrictMode adds extra development-only checks (it doesn't change what users see).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

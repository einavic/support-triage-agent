import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite = the dev server + build tool for the React app.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During development the page runs on :5173 and the API on :3000.
    // The proxy forwards every /api/... request to the Express server, so the page
    // can just call fetch("/api/chat") - the same URL it uses in production.
    proxy: {
      "/api": "http://127.0.0.1:3000"
    }
  }
});

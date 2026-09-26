import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
          updateViaCache: "none",
        })
        .then((registration) => registration.update())
        .catch((error: unknown) => {
          console.error("CampusX service worker registration failed:", error);
        });
    });
  } else {
    const appScope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations
        .filter((registration) => registration.scope === appScope)
        .forEach((registration) => void registration.unregister());
    });
  }
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import RedesignApp from "./RedesignApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RedesignApp />
  </StrictMode>,
);

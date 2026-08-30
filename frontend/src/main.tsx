import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import App from "./App";
import "./index.css";
import { AppBoot } from "./temas/variante-empresarial/AppBoot";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("No se encontró el elemento raíz #root en index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppBoot>
      <App />
    </AppBoot>
  </StrictMode>,
);

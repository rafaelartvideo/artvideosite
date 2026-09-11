import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/App.tsx";
import { AppRuntimeBoundary, installModuleLoadRecovery } from "./app/AppRuntimeBoundary.tsx";
import { AppQueryProvider } from "./app/providers/AppQueryProvider.tsx";
import "./styles/index.css";

installModuleLoadRecovery();

createRoot(document.getElementById("root")!).render(
  <AppRuntimeBoundary>
    <BrowserRouter>
      <AppQueryProvider>
        <App />
      </AppQueryProvider>
    </BrowserRouter>
  </AppRuntimeBoundary>,
);

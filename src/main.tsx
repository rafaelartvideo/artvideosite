
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { AppQueryProvider } from "./app/providers/AppQueryProvider.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <AppQueryProvider>
      <App />
    </AppQueryProvider>,
  );
  

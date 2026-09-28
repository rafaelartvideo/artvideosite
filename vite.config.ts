import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

type AppTarget = "site" | "crm" | "combined";

const PUBLIC_SITE_URL = "https://eletronicaartvideo.com.br";

function figmaAssetResolver() {
  return {
    name: "figma-asset-resolver",
    resolveId(id: string) {
      if (id.startsWith("figma:asset/")) {
        const filename = id.replace("figma:asset/", "");
        return path.resolve(__dirname, "src/assets", filename);
      }
    },
  };
}

function appDocumentMeta(target: AppTarget) {
  const meta = target === "site"
    ? {
        title: "Eletrônica ArtVideo",
        description: "Eletrônica ArtVideo — assistência técnica, serviços e soluções em eletrônica.",
        robots: "index, follow",
        appleTitle: "Eletrônica ArtVideo",
      }
    : target === "crm"
      ? {
          title: "Union World",
          description: "Sistema de gestão Union World.",
          robots: "noindex, nofollow",
          appleTitle: "Union World",
        }
      : {
          title: "Proxos",
          description: "Sistema administrativo da Eletrônica ArtVideo.",
          robots: "noindex, nofollow",
          appleTitle: "Proxos",
        };

  return {
    name: "app-document-meta",
    transformIndexHtml(html: string) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
        .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${meta.description}" />`)
        .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${meta.robots}" />`)
        .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*" \/>/, `<meta name="apple-mobile-web-app-title" content="${meta.appleTitle}" />`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const target: AppTarget = mode === "site"
    ? "site"
    : mode === "crm"
      ? "crm"
      : "combined";

  return {
    plugins: [
      figmaAssetResolver(),
      react(),
      tailwindcss(),
      appDocumentMeta(target),
    ],
    define: {
      __APP_TARGET__: JSON.stringify(target),
      __PUBLIC_SITE_URL__: JSON.stringify(PUBLIC_SITE_URL),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query-core")) {
              return "vendor-query";
            }
          },
        },
      },
    },
    assetsInclude: ["**/*.svg", "**/*.csv"],
  };
});

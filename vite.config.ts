import { defineConfig } from "vite";
import path from "path";
import { rm, writeFile } from "node:fs/promises";
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
    : {
        title: "Union World",
        description: "Sistema de gestão Union World.",
        robots: "noindex, nofollow",
        appleTitle: "Union World",
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

function appDomainMetadata(target: AppTarget) {
  return {
    name: "app-domain-metadata",
    async writeBundle(options: { dir?: string }) {
      const outDir = path.resolve(__dirname, options.dir || "dist");

      if (target === "site") {
        await writeFile(
          path.join(outDir, "robots.txt"),
          "User-agent: *\nAllow: /\n\nSitemap: https://eletronicaartvideo.com.br/sitemap.xml\n",
          "utf8",
        );
        await writeFile(
          path.join(outDir, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://eletronicaartvideo.com.br/</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/servicos</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/loja</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/sobre</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/contato</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/assistencia</loc></url>
  <url><loc>https://eletronicaartvideo.com.br/orcamento</loc></url>
</urlset>
`,
          "utf8",
        );
        await writeFile(
          path.join(outDir, "site.webmanifest"),
          JSON.stringify({
            name: "Eletrônica ArtVideo",
            short_name: "ArtVideo",
            start_url: "/",
            display: "standalone",
            background_color: "#0d1b2e",
            theme_color: "#0057e7",
          }),
          "utf8",
        );
        return;
      }

      await writeFile(
        path.join(outDir, "robots.txt"),
        "User-agent: *\nDisallow: /\n",
        "utf8",
      );
      await rm(path.join(outDir, "sitemap.xml"), { force: true });
      await writeFile(
        path.join(outDir, "site.webmanifest"),
        JSON.stringify({
          name: "Union World",
          short_name: "Union World",
          start_url: "/admin",
          display: "standalone",
          background_color: "#0d1b2e",
          theme_color: "#0057e7",
        }),
        "utf8",
      );
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
      appDomainMetadata(target),
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

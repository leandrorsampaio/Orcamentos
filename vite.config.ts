import { defineConfig } from "vite";

// Two entry points:
//  - index.html         → the admin SPA (Lista + Editor), served for app routes.
//  - src/public-share   → a small standalone bundle used by the server-rendered
//                         public share page (/o/:shareId) for "Baixar PDF".
//    It is emitted with a stable name (share.js) so the Worker HTML can
//    reference it without knowing a content hash.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        share: "src/public-share/main.ts",
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "share" ? "share.js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

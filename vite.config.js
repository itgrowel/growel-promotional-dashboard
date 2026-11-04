// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const stripRouteTreeTypes = (code) =>
    code
        .replace(/\nimport type \{ getRouter \} from [\s\S]*$/, "")
        .replace(/^\/\/ @ts-nocheck\r?\n/m, "");

const javascriptRouteTreePlugin = {
    name: "javascript-route-tree",
    enforce: "pre",
    async transform(code, id) {
        const normalizedId = id.replaceAll("\\", "/").split("?")[0];
        if (!normalizedId.endsWith("/src/routeTree.gen.js")) return null;

        const javascript = stripRouteTreeTypes(code);
        return javascript === code ? null : { code: javascript, map: null };
    },
};

export default defineConfig({
    nitro: {
        preset: "node-server",
    },
    vite: {
        plugins: [javascriptRouteTreePlugin],
        optimizeDeps: {
            rolldownOptions: {
                plugins: [javascriptRouteTreePlugin],
            },
        },
    },
    tanstackStart: {
        // Redirect TanStack Start's bundled server entry to src/server.js (our SSR error wrapper).
        // nitro/vite builds from this
        server: { entry: "server" },
        router: {
            generatedRouteTree: "routeTree.gen.js",
            disableTypes: true,
        },
    },
});

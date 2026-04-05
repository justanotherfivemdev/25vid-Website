import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

function normalizePath(id) {
  return id.replaceAll("\\", "/");
}

function getNodeModulePackageName(id) {
  const normalized = normalizePath(id);
  const marker = "/node_modules/";
  const markerIndex = normalized.lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const packagePath = normalized.slice(markerIndex + marker.length);
  const segments = packagePath.split("/");

  if (!segments[0]) {
    return null;
  }

  if (segments[0].startsWith("@") && segments[1]) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${Math.round(value * 100) / 100} ${units[index]}`;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function createHealthPlugin(enabled) {
  if (!enabled) {
    return null;
  }

  const serverStartTime = Date.now();
  const status = {
    state: "idle",
    errors: [],
    warnings: [],
    lastCompileTime: null,
    lastSuccessTime: null,
    compileDuration: 0,
    totalCompiles: 0,
    firstCompileTime: null,
  };
  let compileGeneration = 0;

  const markCompileStart = () => {
    const now = Date.now();
    compileGeneration += 1;
    status.state = "compiling";
    status.lastCompileTime = now;
    if (!status.firstCompileTime) {
      status.firstCompileTime = now;
    }
    return compileGeneration;
  };

  const markSuccess = (generation) => {
    if (generation !== compileGeneration) {
      return;
    }
    status.state = "success";
    status.lastSuccessTime = Date.now();
    status.compileDuration = status.lastCompileTime
      ? Date.now() - status.lastCompileTime
      : 0;
    status.totalCompiles += 1;
    status.errors = [];
  };

  const markFailure = (error, generation = compileGeneration) => {
    if (generation !== compileGeneration) {
      return;
    }
    status.state = "failed";
    status.compileDuration = status.lastCompileTime
      ? Date.now() - status.lastCompileTime
      : 0;
    status.totalCompiles += 1;
    status.errors = [
      {
        message: error?.message || String(error),
        stack: error?.stack || null,
      },
    ];
  };

  const writeJson = (res, code, payload) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload, null, 2));
  };

  return {
    name: "vite-health-check",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        if (status.state === "idle") {
          status.state = "success";
          status.lastSuccessTime = Date.now();
        }
      });

      const originalTransformRequest = server.transformRequest.bind(server);
      server.transformRequest = async (...args) => {
        const generation = markCompileStart();
        try {
          const result = await originalTransformRequest(...args);
          markSuccess(generation);
          return result;
        } catch (error) {
          markFailure(error, generation);
          throw error;
        }
      };

      server.watcher.on("all", (_event, changedPath) => {
        if (!changedPath) return;
        const normalized = changedPath.replaceAll("\\", "/");
        if (
          normalized.includes("/node_modules/") ||
          normalized.includes("/build/") ||
          normalized.includes("/dist/")
        ) {
          return;
        }
        markCompileStart();
      });

      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        const uptime = Date.now() - serverStartTime;
        const memUsage = process.memoryUsage();
        const isHealthy = status.state === "success";
        const simpleStatus = {
          state: status.state,
          isHealthy,
          errorCount: status.errors.length,
          warningCount: status.warnings.length,
        };

        if (pathname === "/health") {
          writeJson(res, isHealthy ? 200 : 503, {
            status: isHealthy ? "healthy" : "unhealthy",
            timestamp: new Date().toISOString(),
            uptime: {
              seconds: Math.floor(uptime / 1000),
              formatted: formatDuration(uptime),
            },
            vite: {
              ...simpleStatus,
              hasCompiled: status.totalCompiles > 0 || status.lastSuccessTime !== null,
              lastCompileTime: status.lastCompileTime
                ? new Date(status.lastCompileTime).toISOString()
                : null,
              lastSuccessTime: status.lastSuccessTime
                ? new Date(status.lastSuccessTime).toISOString()
                : null,
              compileDuration: status.compileDuration
                ? `${status.compileDuration}ms`
                : null,
              totalCompiles: status.totalCompiles,
              firstCompileTime: status.firstCompileTime
                ? new Date(status.firstCompileTime).toISOString()
                : null,
              errors: status.errors,
              warnings: status.warnings,
            },
            server: {
              nodeVersion: process.version,
              platform: os.platform(),
              arch: os.arch(),
              cpus: os.cpus().length,
              memory: {
                heapUsed: formatBytes(memUsage.heapUsed),
                heapTotal: formatBytes(memUsage.heapTotal),
                rss: formatBytes(memUsage.rss),
                external: formatBytes(memUsage.external),
              },
              systemMemory: {
                total: formatBytes(os.totalmem()),
                free: formatBytes(os.freemem()),
                used: formatBytes(os.totalmem() - os.freemem()),
              },
            },
            environment: process.env.NODE_ENV || "development",
          });
          return;
        }

        if (pathname === "/health/simple") {
          res.statusCode = simpleStatus.state === "failed" ? 503 : 200;
          res.setHeader("Content-Type", "text/plain");
          res.end(
            simpleStatus.state === "success"
              ? "OK"
              : simpleStatus.state === "compiling"
                ? "COMPILING"
                : simpleStatus.state === "failed"
                  ? "ERROR"
                  : "IDLE",
          );
          return;
        }

        if (pathname === "/health/ready") {
          writeJson(res, isHealthy ? 200 : 503, {
            ready: isHealthy,
            state: simpleStatus.state,
            reason: isHealthy
              ? null
              : simpleStatus.state === "compiling"
                ? "Compilation in progress"
                : "Compilation failed",
          });
          return;
        }

        if (pathname === "/health/live") {
          writeJson(res, 200, {
            alive: true,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (pathname === "/health/errors") {
          writeJson(res, 200, {
            errorCount: status.errors.length,
            warningCount: status.warnings.length,
            errors: status.errors,
            warnings: status.warnings,
            state: status.state,
          });
          return;
        }

        if (pathname === "/health/stats") {
          writeJson(res, 200, {
            totalCompiles: status.totalCompiles,
            averageCompileTime:
              status.totalCompiles > 0
                ? `${Math.round(uptime / status.totalCompiles)}ms`
                : null,
            lastCompileDuration: status.compileDuration
              ? `${status.compileDuration}ms`
              : null,
            firstCompileTime: status.firstCompileTime
              ? new Date(status.firstCompileTime).toISOString()
              : null,
            serverUptime: formatDuration(uptime),
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");
  const publicUrl = env.PUBLIC_URL || "";
  const processEnv = {
    NODE_ENV: mode,
    PUBLIC_URL: publicUrl,
    ...Object.fromEntries(
      Object.entries(env).filter(([key]) => key.startsWith("REACT_APP_")),
    ),
  };

  return {
    envPrefix: ["VITE_", "REACT_APP_"],
    plugins: [
      react(),
      createHealthPlugin(env.ENABLE_HEALTH_CHECK === "true"),
    ].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@",
          replacement: path.resolve(workspaceRoot, "src"),
        },
        {
          find: "milsymbol-modern",
          replacement: path.resolve(
            workspaceRoot,
            "node_modules/milsymbol/index.mjs",
          ),
        },
        {
          find: "milsymbol-symbol",
          replacement: path.resolve(
            workspaceRoot,
            "node_modules/milsymbol/src/ms/symbol.js",
          ),
        },
      ],
    },
    define: {
      global: "globalThis",
      "process.env": JSON.stringify(processEnv),
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      watch: {
        ignored: [
          "**/.git/**",
          "**/build/**",
          "**/dist/**",
          "**/coverage/**",
        ],
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
    },
    build: {
      outDir: "build",
      emptyOutDir: true,
      // Mapbox GL ships a large compiled WebGL runtime. After route splitting and
      // vendor isolation, the remaining core chunk is still expected to exceed
      // Vite's raw-byte warning threshold even though its compressed size is in
      // line with the upstream library's published budget.
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = normalizePath(id);

            if (!normalized.includes("/node_modules/")) {
              return null;
            }

            const packageName = getNodeModulePackageName(normalized);

            if (
              packageName === "mapbox-gl"
            ) {
              return "vendor-mapbox-core";
            }
            if (
              normalized.includes("/node_modules/mapbox-gl/dist/style-spec/")
            ) {
              return "vendor-mapbox-style";
            }
            if (
              normalized.includes("react-dom") ||
              normalized.includes("react-router-dom") ||
              normalized.includes("/react/")
            ) {
              return "vendor-react";
            }
            if (
              packageName === "react-map-gl" ||
              packageName === "@vis.gl/react-mapbox" ||
              packageName === "@vis.gl/react-maplibre"
            ) {
              return "vendor-react-map";
            }
            if (
              packageName?.startsWith("@mapbox/") ||
              packageName === "cheap-ruler" ||
              packageName === "earcut" ||
              packageName === "geojson-vt" ||
              packageName === "gl-matrix" ||
              packageName === "grid-index" ||
              packageName === "kdbush" ||
              packageName === "martinez-polygon-clipping" ||
              packageName === "pbf" ||
              packageName === "quickselect" ||
              packageName === "supercluster" ||
              packageName === "tinyqueue"
            ) {
              return "vendor-mapbox-support";
            }
            if (
              packageName === "leaflet" ||
              packageName === "react-leaflet"
            ) {
              return "vendor-leaflet";
            }
            if (packageName === "ol") {
              return "vendor-openlayers";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/iconparts/ground.js")
            ) {
              return "vendor-symbols-ground";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/iconparts/tactical-points.js")
            ) {
              return "vendor-symbols-points";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/iconparts/")
            ) {
              return "vendor-symbols-iconparts";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/numbersidc/sidc/")
            ) {
              return "vendor-symbols-sidc";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/numbersidc/metadata.js")
            ) {
              return "vendor-symbols-metadata";
            }
            if (
              normalized.includes("/node_modules/milsymbol/src/ms/")
            ) {
              return "vendor-symbols-core";
            }
            if (packageName === "milsymbol") {
              return "vendor-symbols";
            }
            if (
              packageName === "recharts" ||
              normalized.includes("/node_modules/d3-")
            ) {
              return "vendor-charts";
            }
            if (
              packageName?.startsWith("@radix-ui/") ||
              packageName === "lucide-react" ||
              packageName === "cmdk" ||
              packageName === "embla-carousel-react" ||
              packageName === "vaul" ||
              packageName === "sonner"
            ) {
              return "vendor-ui";
            }
            return "vendor";
          },
        },
      },
    },
  };
});

import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".glsl": "text/plain",
  ".frag": "text/plain",
  ".vert": "text/plain",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

const ROOT = join(import.meta.dir, "renderer");
const DIST = join(import.meta.dir, "..", "dist", "renderer");

Bun.serve({
  port: 5173,
  fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;

    // Try renderer source first, then dist for bundled JS
    let fullPath = join(ROOT, filePath);
    if (!existsSync(fullPath)) {
      fullPath = join(DIST, filePath);
    }

    if (!existsSync(fullPath)) {
      return new Response("Not Found", { status: 404 });
    }

    const ext = extname(fullPath);
    const contentType = MIME[ext] || "application/octet-stream";
    const content = readFileSync(fullPath);

    return new Response(content, {
      headers: { "Content-Type": contentType },
    });
  },
});

console.log("Dev server running at http://localhost:5173");

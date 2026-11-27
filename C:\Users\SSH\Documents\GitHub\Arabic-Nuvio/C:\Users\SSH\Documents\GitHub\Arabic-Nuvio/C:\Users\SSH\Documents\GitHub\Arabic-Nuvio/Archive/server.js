/**
 * Local Development & Testing Server for Arabic Nuvio Addon, Providers & Collections
 *Serves static files with full CORS headers for Nuvio Plugin Tester, Addon Manager & Collections URL Import.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".html": "text/html; charset=utf-8"
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = decodeURIComponent((req.url || "/").split("?")[0]);
  const relPath = cleanUrl === "/" ? "/manifest.json" : cleanUrl;
  const filePath = path.join(ROOT_DIR, relPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Not Found", path: cleanUrl }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stats.size,
      "Cache-Control": "public, max-age=300"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Arabic Nuvio Local Server running on http://localhost:${PORT}`);
  console.log(`   • Provider Manifest : http://localhost:${PORT}/manifest.json`);
  console.log(`   • Catalog Addon     : http://localhost:${PORT}/addon/manifest.json`);
  console.log(`   • Nuvio Collections : http://localhost:${PORT}/nuvio-collections.json\n`);
});

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const appConfig = require("../app.json");

const projectRoot = path.resolve(__dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const indexFile = path.join(distRoot, "index.html");
const port = Number(process.env.RAINFROG_WEB_PORT ?? 8081);
const apiTarget = new URL(process.env.RAINFROG_API_URL ?? appConfig.expo.extra.apiUrl);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendFile(req, res, file) {
  const extension = path.extname(file).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", contentTypes[extension] ?? "application/octet-stream");
  res.setHeader("Cache-Control", extension === ".html" ? "no-store" : "public, max-age=31536000, immutable");
  if (req.method === "HEAD") return res.end();
  return fs.createReadStream(file).on("error", () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end("Could not read web export");
  }).pipe(res);
}

function sendAppShell(req, res) {
  let html;
  try {
    html = fs.readFileSync(indexFile, "utf8")
      .replace(
        /(<meta name="viewport" content=")([^"]*)(" \/>)/,
        (_match, before, content, after) => `${before}${content}, viewport-fit=cover${after}`,
      )
      .replace(
        "</head>",
        `<style>html,body,#root{margin:0;min-height:100%;background:#0A0A0A}body{overscroll-behavior-y:none}</style></head>`,
      );
  } catch {
    res.statusCode = 500;
    return res.end("Could not read web export");
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") return res.end();
  return res.end(html);
}

function proxyApi(req, res, incomingUrl) {
  const upstreamPath = `${incomingUrl.pathname.replace(/^\/rainfrog-api/, "") || "/"}${incomingUrl.search}`;
  const headers = { ...req.headers, host: apiTarget.host, "accept-encoding": "identity" };
  delete headers.connection;

  const upstream = https.request({
    protocol: apiTarget.protocol,
    hostname: apiTarget.hostname,
    port: apiTarget.port || 443,
    method: req.method,
    path: upstreamPath,
    headers,
  }, (upstreamResponse) => {
    res.statusCode = upstreamResponse.statusCode ?? 502;
    Object.entries(upstreamResponse.headers).forEach(([name, value]) => {
      if (value !== undefined && name !== "connection" && name !== "transfer-encoding") res.setHeader(name, value);
    });
    upstreamResponse.pipe(res);
  });
  upstream.on("error", (error) => {
    console.error(`API proxy failed: ${error.message}`);
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ status: 0, error: "Unable to reach Rainfrog" }));
  });
  req.pipe(upstream);
}

if (!fs.existsSync(indexFile)) {
  console.error("No Expo web export found. Run `npx expo export --platform web` first.");
  process.exit(1);
}

http.createServer((req, res) => {
  let incomingUrl;
  try {
    incomingUrl = new URL(req.url ?? "/", "http://localhost");
  } catch {
    res.statusCode = 400;
    return res.end("Bad Request");
  }
  if (incomingUrl.pathname === "/rainfrog-api" || incomingUrl.pathname.startsWith("/rainfrog-api/")) {
    return proxyApi(req, res, incomingUrl);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end("Method Not Allowed");
  }

  let pathname;
  try {
    pathname = decodeURIComponent(incomingUrl.pathname);
  } catch {
    res.statusCode = 400;
    return res.end("Bad Request");
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const requestedFile = path.resolve(distRoot, relativePath);
  const withinDist = requestedFile === distRoot || requestedFile.startsWith(`${distRoot}${path.sep}`);
  if (withinDist && fs.existsSync(requestedFile) && fs.statSync(requestedFile).isFile()) {
    if (requestedFile === indexFile) return sendAppShell(req, res);
    return sendFile(req, res, requestedFile);
  }

  // Expo Router owns extensionless paths such as /join/:token. Returning the
  // same app shell lets it resolve the route after a refresh or shared-link open.
  const requestedExtension = path.extname(pathname).toLowerCase();
  const looksLikeAsset = pathname.startsWith("/_expo/")
    || pathname.startsWith("/assets/")
    || Object.hasOwn(contentTypes, requestedExtension);
  if (!looksLikeAsset) return sendAppShell(req, res);
  res.statusCode = 404;
  return res.end("Not Found");
}).listen(port, "0.0.0.0", () => {
  console.log(`Rainfrog web export available at http://localhost:${port}`);
  const lanAddress = Object.values(os.networkInterfaces()).flat().find((address) => (
    address && address.family === "IPv4" && !address.internal
  ));
  if (lanAddress) console.log(`LAN invite base: http://${lanAddress.address}:${port}`);
});

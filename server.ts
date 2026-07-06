import { createServer } from "https";
import next from "next";
import fs from "fs";
import path from "path";
import { glob } from "glob";

const dev = process.env.NODE_ENV !== "production";
const bindHost = "0.0.0.0";
const hostname = process.env.TAILSCALE_HOSTNAME ?? "localhost";
const port = parseInt(process.env.PORT ?? "9879", 10);

async function findCerts() {
  const certDir = path.resolve(process.env.HOME ?? "~", ".config/cert");
  const crtFiles = await glob("*.crt", { cwd: certDir });
  const keyFiles = await glob("*.key", { cwd: certDir });
  if (crtFiles.length && keyFiles.length) {
    return {
      cert: fs.readFileSync(path.join(certDir, crtFiles[0])),
      key: fs.readFileSync(path.join(certDir, keyFiles[0])),
    };
  }
  const pemCert = path.join(certDir, "cert.pem");
  const pemKey = path.join(certDir, "key.pem");
  if (fs.existsSync(pemCert) && fs.existsSync(pemKey)) {
    return { cert: fs.readFileSync(pemCert), key: fs.readFileSync(pemKey) };
  }
  throw new Error(`No TLS certificates found in ${certDir}`);
}

const NUDGE_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes

async function startNudgeScheduler() {
  const { runNudgeChecks } = await import("./lib/nudges");
  const tick = async () => {
    try {
      const result = await runNudgeChecks();
      if (result.sent || result.considered) {
        console.log(
          `[nudges] scanned=${result.scanned} considered=${result.considered} sent=${result.sent}`
        );
      }
    } catch (err) {
      console.error("[nudges] tick failed:", err);
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, NUDGE_INTERVAL_MS);
}

async function main() {
  const app = next({ dev, hostname: bindHost, port });
  const handle = app.getRequestHandler();
  await app.prepare();
  startNudgeScheduler().catch((err) => console.error("[nudges] failed to start:", err));

  try {
    const { cert, key } = await findCerts();
    createServer({ cert, key }, (req, res) => {
      handle(req, res).catch((err) => {
        console.error("Request error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    }).listen(port, bindHost, () => {
      console.log(`> Kinetica ready on https://${hostname}:${port}`);
    });
  } catch (e) {
    console.warn("TLS certs not found, falling back to HTTP:", (e as Error).message);
    const { createServer: createHttp } = await import("http");
    createHttp((req, res) => {
      handle(req, res).catch((err) => {
        console.error("Request error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    }).listen(port, bindHost, () => {
      console.log(`> Kinetica ready on http://${hostname}:${port} (no TLS)`);
    });
  }
}

main().catch(console.error);

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const template = readFileSync(path.join(root, "worker/index.js"), "utf8");
const html = readFileSync(path.join(root, "dist/index.html"), "utf8");
const login = readFileSync(path.join(root, "dist/login.html"), "utf8");
const setup = readFileSync(path.join(root, "dist/setup.html"), "utf8");
const css = readFileSync(path.join(root, "dist/styles.css"), "utf8");
const js = readFileSync(path.join(root, "dist/app.js"), "utf8");
const hero = readFileSync(path.join(root, "dist/assets/smart-cane-hero.png"));
const heroDataUrl = `data:image/png;base64,${hero.toString("base64")}`;

const output = template
  .replace('"__SMART_CANE_HTML__"', () => JSON.stringify(html))
  .replace('"__SMART_CANE_LOGIN__"', () => JSON.stringify(login))
  .replace('"__SMART_CANE_SETUP__"', () => JSON.stringify(setup))
  .replace('"__SMART_CANE_CSS__"', () => JSON.stringify(css))
  .replace('"__SMART_CANE_JS__"', () => JSON.stringify(js))
  .replaceAll("assets/smart-cane-hero.png", heroDataUrl);

const serverDir = path.join(root, "dist/server");
mkdirSync(serverDir, { recursive: true });
writeFileSync(path.join(serverDir, "index.js"), output);
console.log("Built dist/server/index.js with dashboard assets and API routes");

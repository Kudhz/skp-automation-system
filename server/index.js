import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createApiApp } from "./app.js";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDirectory, "../.env") });
dotenv.config({ path: path.resolve(serverDirectory, "../public/.env") });

const port = Number.parseInt(process.env.NODE_API_PORT || "4001", 10);
const host = process.env.NODE_API_HOST || "127.0.0.1";
const app = createApiApp();
const server = app.listen(port, host, () => {
  console.log(`Node API berjalan di http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("Gagal menghentikan Node API dengan bersih:", error);
        process.exitCode = 1;
      }
    });
  });
}

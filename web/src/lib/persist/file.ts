// JSON-file backend: $SPENDBENCH_DATA_DIR/db.json (default web/.data). Atomic write via tmp + rename.
import fs from "node:fs";
import path from "node:path";
import type { DB } from "../types";
import type { Backend } from "./types";

export function dataDir() {
  return process.env.SPENDBENCH_DATA_DIR || path.join(process.cwd(), ".data");
}

export function fileBackend(): Backend {
  const dir = dataDir();
  const file = path.join(dir, "db.json");
  const parse = (raw: string) => JSON.parse(raw) as Partial<DB>;
  return {
    kind: "file",
    describe: () => file,
    loadSync() {
      if (!fs.existsSync(file)) return null;
      return parse(fs.readFileSync(file, "utf8"));
    },
    async load() {
      try {
        return parse(await fs.promises.readFile(file, "utf8"));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async save(json) {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, json);
      await fs.promises.rename(tmp, file);
    },
    saveSync(json) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, file);
    },
  };
}

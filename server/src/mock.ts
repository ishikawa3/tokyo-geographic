import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const fixtureCache = new Map<string, unknown>();

/** APIキー未設定なら自動的にモックモード。MOCK=1 で強制。 */
export function isMockMode(): boolean {
  return process.env.MOCK === "1" || !process.env.REINFOLIB_API_KEY;
}

export function loadFixture(name: string): unknown {
  const cached = fixtureCache.get(name);
  if (cached !== undefined) return cached;
  const parsed = JSON.parse(readFileSync(join(fixturesDir, name), "utf-8"));
  fixtureCache.set(name, parsed);
  return parsed;
}

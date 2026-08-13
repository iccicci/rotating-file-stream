import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");
const DEPENDENCY = "rotating-file-stream";

type PackageJson = {
  dependencies?: { [key: string]: string };
  name?: string;
  optionalDependencies?: { [key: string]: string };
  peerDependencies?: { [key: string]: string };
  version?: string;
};

const readPackageJson = async (path: string): Promise<PackageJson> => JSON.parse(await readFile(path, "utf8")) as PackageJson;

const main = async (): Promise<void> => {
  const root = await readPackageJson(join(ROOT, "package.json"));
  const expected = root.version;

  if(typeof expected !== "string") {
    console.error("Root package.json is missing a version");
    process.exit(1);
  }

  const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const packages = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const errors: string[] = [];

  for(const directory of packages) {
    const pkg = await readPackageJson(join(PACKAGES_DIR, directory, "package.json"));
    const label = pkg.name ?? directory;

    if(pkg.version !== expected) errors.push(`${label}: version is ${pkg.version ?? "(missing)"}, expected ${expected}`);

    for(const field of ["dependencies", "peerDependencies", "optionalDependencies"] as const) {
      const range = pkg[field]?.[DEPENDENCY];

      if(range !== undefined && range !== expected) errors.push(`${label}: ${field}["${DEPENDENCY}"] is ${range}, expected ${expected}`);
    }
  }

  if(errors.length) {
    console.error(`Version check failed:\n${errors.map(error => `  - ${error}`).join("\n")}`);
    process.exit(1);
  }

  console.log(`Versions ok (${packages.length} package(s) at ${expected})`);
};

await main();

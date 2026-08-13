import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");

type PackageJson = {
  dependencies?: { [key: string]: string };
  name?: string;
  optionalDependencies?: { [key: string]: string };
  peerDependencies?: { [key: string]: string };
};

type WorkspacePackage = {
  deps: Set<string>;
  dir: string;
  name: string;
};

const readPackageJson = async (path: string): Promise<PackageJson> => JSON.parse(await readFile(path, "utf8")) as PackageJson;

const dependencyNames = (pkg: PackageJson): string[] => [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.optionalDependencies ?? {})
];

const main = async (): Promise<void> => {
  const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
  const directories = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  const pkgs: WorkspacePackage[] = [];

  for(const directory of directories) {
    let pkg: PackageJson;

    try {
      pkg = await readPackageJson(join(PACKAGES_DIR, directory, "package.json"));
    } catch(error) {
      continue;
    }

    if(typeof pkg.name !== "string") continue;

    pkgs.push({
      deps: new Set(dependencyNames(pkg)),
      dir:  join(PACKAGES_DIR, directory),
      name: pkg.name
    });
  }

  const names = new Set(pkgs.map(pkg => pkg.name));

  for(const pkg of pkgs) pkg.deps = new Set([...pkg.deps].filter(name => names.has(name)));

  const incoming = new Map(pkgs.map(pkg => [pkg.name, pkg.deps.size]));
  const byName = new Map(pkgs.map(pkg => [pkg.name, pkg]));
  const dependents = new Map(pkgs.map(pkg => [pkg.name, [] as string[]]));

  for(const pkg of pkgs) for(const dep of pkg.deps) dependents.get(dep)?.push(pkg.name);

  const queue = pkgs.filter(pkg => pkg.deps.size === 0).map(pkg => pkg.name).sort();
  const ordered: string[] = [];

  while(queue.length) {
    const name = queue.shift();

    if(name === undefined) break;

    const current = byName.get(name);

    if(current === undefined) continue;

    ordered.push(current.dir);

    for(const dependent of (dependents.get(name) ?? []).sort()) {
      const next = (incoming.get(dependent) ?? 0) - 1;

      incoming.set(dependent, next);
      if(next === 0) queue.push(dependent);
    }

    queue.sort();
  }

  if(ordered.length !== pkgs.length) {
    console.error("error: cyclic workspace dependencies among packages/");
    process.exit(1);
  }

  for(const dir of ordered) console.log(dir);
};

await main();

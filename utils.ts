import { writeFile } from "fs/promises";

const common: string[] = ["*gz", "*log", "*tmp", "*txt", ".gitignore", ".npmignore", ".nyc_output", "coverage", "node_modules", ""];
const git: string[] = ["dist"];
const npm: string[] = [".*", "index.ts", "test", "tsconfig.*", "utils.ts"];

if(process.argv[2] === "ignore") {
  (async () => {
    await writeFile(".gitignore", git.concat(common).join("\n"));
    await writeFile(".npmignore", npm.concat(common).join("\n"));
  })();
}

import { writeFile } from "fs/promises";

const common: string[] = ["*gz", "*log", "*tmp", "*txt", ".gitignore", ".npmignore", "coverage", "node_modules", ""];
const git: string[] = ["dist"];
const npm: string[] = [".*", "CHANGELOG.md", "index.ts", "jest.config.js", "test", "tsconfig.*", "utils.ts"];

if(process.argv[2] === "ignore") {
  (async () => {
    await writeFile(".gitignore", git.concat(common).join("\n"));
    await writeFile(".npmignore", npm.concat(common).join("\n"));
  })();
}

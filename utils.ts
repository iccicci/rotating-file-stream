"use strict";

import { readFile, unlink, writeFile } from "fs";

const common: string[] = ["*gz", "*log", "*tmp", "*txt", ".gitignore", ".npmignore", ".nyc_output", "coverage", "node_modules", ""];
const git: string[] = ["index.d.ts", "index.js"];
const npm: string[] = [".*", "index.ts", "test", "tsconfig.json", "tslint.json", "utils.ts"];

const readme: (err: Error, data: string) => void = (err, data) => {
	if(err) return process.stderr.write(`Error reading README.md: ${err.message}`);

	const input = data.split("\n");

	readFile("index.d.ts", "utf8", (err: Error, data: string) => {
		if(err) return process.stderr.write(`Error reading index.d.ts: ${err.message}`);

		const output = [];
		let begin: boolean, end: boolean;

		input.map((line: string) => {
			if(begin) {
				if(end) output.push(line);
				else if(line === "```") {
					output.push(line);
					end = true;
				}
			}

			if(! begin) {
				output.push(line);
				if(line === "```typescript") {
					let first: boolean, interf: boolean;
					begin = true;
					data.split("\n").map((line: string) => {
						if(! first) return (first = true);
						if(interf) return (interf = ! line.match(/}$/));
						if(line.match(/interface Chunk/) || line.match(/interface Opts/)) return (interf = true);
						if(line.match(/class RotatingFileStream/)) interf = ((line = line.replace("{", "{}")) as unknown) as boolean;
						if(! line.match(/Callback/) && ! line.match(/export \{}/)) output.push(line.replace("    ", "  "));
					});
					output.pop();
				}
			}
		});

		writeFile("README.md", output.join("\n"), () => {});
	});
};

if(process.argv[2] === "clean") unlink("index.js", (): void => unlink("index.d.ts", (): void => {}));
if(process.argv[2] === "ignore") writeFile(".gitignore", git.concat(common).join("\n"), (): void => writeFile(".npmignore", npm.concat(common).join("\n"), (): void => {}));
if(process.argv[2] === "readme") readFile("README.md", "utf8", readme);

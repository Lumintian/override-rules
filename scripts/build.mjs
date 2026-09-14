import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const OUT_DIR = "dist";

function createBuildOptions(entryPoint, target = "ES2025") {
    const source = fs.readFileSync(entryPoint, "utf8");
    const bannerMatch = source.match(/\/\*![\s\S]*?\*\//);
    const bannerText = bannerMatch ? bannerMatch[0] : "";

    return {
        entryPoints: [entryPoint],
        bundle: true,
        platform: "neutral",
        format: "iife",
        target,
        legalComments: "none",
        charset: "utf8",
        banner: { js: bannerText },
    };
}

const convertOptions = createBuildOptions("src/main.ts");
const renameOptions = createBuildOptions("scripts/substore/rename.ts", "ES2020");

fs.mkdirSync(OUT_DIR, { recursive: true });

Promise.all([
    esbuild.build({ ...convertOptions, outfile: path.join(OUT_DIR, "convert.js") }),
    esbuild.build({
        ...convertOptions,
        minify: true,
        outfile: path.join(OUT_DIR, "convert.min.js"),
        drop: ["debugger"],
    }),
    esbuild.build({ ...renameOptions, outfile: path.join(OUT_DIR, "rename.js") }),
    esbuild.build({
        ...renameOptions,
        minify: true,
        outfile: path.join(OUT_DIR, "rename.min.js"),
        drop: ["debugger"],
    }),
]).catch((err) => {
    console.error(err);
    process.exit(1);
});

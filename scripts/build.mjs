import * as esbuild from "esbuild";
import * as fs from "node:fs";

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

Promise.all([
    esbuild.build({ ...convertOptions, outfile: "convert.js" }),
    esbuild.build({
        ...convertOptions,
        minify: true,
        outfile: "convert.min.js",
        drop: ["debugger"],
    }),
    esbuild.build({ ...renameOptions, outfile: "rename.js" }),
    esbuild.build({
        ...renameOptions,
        minify: true,
        outfile: "rename.min.js",
        drop: ["debugger"],
    }),
]).catch((err) => {
    console.error(err);
    process.exit(1);
});

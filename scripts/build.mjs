import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const OUT_DIR = "dist";
const entries = [
    { name: "convert", source: "src/main.ts", target: "ES2025" },
    { name: "rename", source: "scripts/substore/rename.ts", target: "ES2020" },
    { name: "sort", source: "scripts/substore/sort.ts", target: "ES2020" },
];

function createBuildOptions(entryPoint, target) {
    const source = fs.readFileSync(entryPoint, "utf8");
    const bannerText = source.match(/\/\*![\s\S]*?\*\//)?.[0] ?? "";
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

fs.mkdirSync(OUT_DIR, { recursive: true });
Promise.all(
    entries.flatMap(({ name, source, target }) => {
        const options = createBuildOptions(source, target);
        return [false, true].map((minify) =>
            esbuild.build({
                ...options,
                minify,
                outfile: path.join(OUT_DIR, `${name}${minify ? ".min" : ""}.js`),
                ...(minify ? { drop: ["debugger"] } : {}),
            })
        );
    })
).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

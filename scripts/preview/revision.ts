import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Track every TypeScript dependency of the renamer and override, including shared preferences. */
export function sourceRevision(root: string): string {
    const files = ["src", "shared", "scripts/substore"].flatMap((relative) => {
        const directory = path.join(root, relative);
        if (!existsSync(directory)) return [];
        return readdirSync(directory, { recursive: true })
            .filter((file): file is string => typeof file === "string" && file.endsWith(".ts"))
            .map((file) => path.join(relative, file));
    });
    const hash = createHash("sha256");
    for (const file of files.sort()) {
        hash.update(file.split(path.sep).join("/")).update("\0");
        hash.update(readFileSync(path.join(root, file))).update("\0");
    }
    return hash.digest("hex").slice(0, 16);
}

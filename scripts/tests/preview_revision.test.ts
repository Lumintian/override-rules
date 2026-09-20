import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { sourceRevision } from "../preview/revision";

function fixture(): string {
    const root = mkdtempSync(path.join(tmpdir(), "ordering-revision-"));
    for (const dir of ["src", "shared", "scripts/substore"])
        mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, "src/main.ts"), "export const main = 1;");
    writeFileSync(path.join(root, "shared/preferences.ts"), "export const hk = 10;");
    writeFileSync(path.join(root, "scripts/substore/rename.ts"), "export const rename = 1;");
    return root;
}

test("shared preference edits invalidate the preview revision without restarting", (t) => {
    const root = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const before = sourceRevision(root);
    assert.equal(sourceRevision(root), before);
    writeFileSync(path.join(root, "shared/preferences.ts"), "export const hk = 20;");
    assert.notEqual(sourceRevision(root), before);
});

test("new and removed shared modules change the fingerprint; non-source files do not", (t) => {
    const root = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const before = sourceRevision(root);
    writeFileSync(path.join(root, "shared/notes.md"), "not a module");
    assert.equal(sourceRevision(root), before);
    const file = path.join(root, "shared/new.ts");
    writeFileSync(file, "");
    assert.notEqual(sourceRevision(root), before);
    rmSync(file);
    assert.equal(sourceRevision(root), before);
});

test("revision is deterministic across copied source roots", (t) => {
    const root = fixture();
    const copy = mkdtempSync(path.join(tmpdir(), "ordering-revision-copy-"));
    t.after(() => {
        rmSync(root, { recursive: true, force: true });
        rmSync(copy, { recursive: true, force: true });
    });
    cpSync(root, copy, { recursive: true });
    assert.equal(sourceRevision(root), sourceRevision(copy));
});

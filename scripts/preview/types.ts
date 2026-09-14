import type { ClashConfig } from "../../src/types";

export type InputFormat = "auto" | "names" | "clash";

export interface PreviewRequest {
    content: string;
    format: InputFormat;
    rename: boolean;
    renameArgs: string;
    overrideArgs: string;
}

export interface NameChange {
    index: number;
    before: string;
    after: string | null;
    country?: string;
}

export interface PreviewResult {
    revision: string;
    config: ClashConfig;
    yaml: string;
    changes: NameChange[];
    members: Record<string, string[]>;
    warnings: string[];
    stats: { input: number; output: number; removed: number; groups: number };
}

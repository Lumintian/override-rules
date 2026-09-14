import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import { PreviewEngine } from "./engine";
import { importContent } from "./import";
import { MAX_INPUT_BYTES, validateRequest } from "./input";

export const PROJECT_ROOT = path.resolve(__dirname, "../..");

async function jsonBody(request: IncomingMessage): Promise<unknown> {
    if (!request.headers["content-type"]?.startsWith("application/json"))
        throw new Error("请求必须使用 application/json。");
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_INPUT_BYTES + 32_768) throw new Error("请求内容超过大小限制。");
        chunks.push(buffer);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new Error("请求不是有效 JSON。");
    }
}

function send(response: ServerResponse, status: number, contentType: string, body: string): void {
    response.writeHead(status, { "content-type": `${contentType}; charset=utf-8` });
    response.end(body);
}

export function createPreviewServer(
    options: { root?: string; importer?: typeof importContent } = {}
) {
    const root = options.root ?? PROJECT_ROOT;
    const engine = new PreviewEngine(root);
    const token = randomBytes(24).toString("hex");
    const assets = path.join(root, "scripts/preview/web");
    const server = createServer(async (request, response) => {
        response.setHeader("cache-control", "no-store");
        response.setHeader("x-content-type-options", "nosniff");
        response.setHeader("referrer-policy", "no-referrer");
        response.setHeader(
            "content-security-policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        );
        const host = request.headers.host ?? "";
        // SSH 转发保留浏览器的 Host，本地端口不必等于服务端监听端口。
        const localHost = /^(127\.0\.0\.1|localhost|\[::1\])(?::([0-9]{1,5}))?$/i.exec(host);
        if (
            !localHost ||
            (localHost[2] && (Number(localHost[2]) < 1 || Number(localHost[2]) > 65535))
        ) {
            send(response, 403, "text/plain", "仅允许本地访问。");
            return;
        }
        const origin = request.headers.origin;
        if (
            (origin && origin !== new URL(`http://${host}`).origin) ||
            request.headers["sec-fetch-site"] === "cross-site"
        ) {
            send(response, 403, "text/plain", "不允许跨站请求。");
            return;
        }
        const route = request.url?.split("?")[0];
        if (route?.startsWith("/api/") && request.headers["x-preview-token"] !== token) {
            send(
                response,
                403,
                "application/json",
                JSON.stringify({ error: "预览会话已失效，请刷新本地页面。" })
            );
            return;
        }
        try {
            if (request.method === "GET" && route === "/") {
                send(
                    response,
                    200,
                    "text/html",
                    readFileSync(path.join(assets, "index.html"), "utf8").replace(
                        "__PREVIEW_TOKEN__",
                        token
                    )
                );
            } else if (request.method === "GET" && route === "/app.css") {
                send(response, 200, "text/css", readFileSync(path.join(assets, "app.css"), "utf8"));
            } else if (request.method === "GET" && route === "/app.js") {
                const output = await build({
                    entryPoints: [path.join(assets, "app.ts")],
                    bundle: true,
                    write: false,
                    platform: "browser",
                    target: "es2022",
                    logLevel: "silent",
                });
                send(response, 200, "text/javascript", output.outputFiles[0].text);
            } else if (request.method === "GET" && route === "/api/revision") {
                send(
                    response,
                    200,
                    "application/json",
                    JSON.stringify({ revision: engine.revision() })
                );
            } else if (request.method === "POST" && route === "/api/preview") {
                const data = validateRequest(await jsonBody(request));
                send(response, 200, "application/json", JSON.stringify(await engine.preview(data)));
            } else if (request.method === "POST" && route === "/api/import") {
                const data = (await jsonBody(request)) as { url?: unknown };
                if (!data || typeof data.url !== "string") throw new Error("请提供链接。");
                const content = await (options.importer ?? importContent)(data.url);
                send(response, 200, "application/json", JSON.stringify({ content }));
            } else if (
                request.method === "GET" &&
                (route === "/favicon.svg" || route === "/favicon.ico")
            ) {
                send(
                    response,
                    200,
                    "image/svg+xml",
                    readFileSync(path.join(assets, "favicon.svg"), "utf8")
                );
            } else {
                send(response, 404, "text/plain", "Not found");
            }
        } catch (error) {
            // 不记录请求正文、节点凭据或订阅链接。
            const message = error instanceof Error ? error.message : "预览失败。";
            if (!response.headersSent && !response.destroyed)
                send(response, 400, "application/json", JSON.stringify({ error: message }));
        }
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    return { server, engine, token };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const arg = args.find((value) => value.startsWith("--port="));
    const port = arg ? Number(arg.slice(7)) : 8787;
    if (args.some((value) => !value.startsWith("--port="))) {
        console.error("预览服务仅支持 --port=端口 参数；远程访问请使用 SSH 隧道。");
        process.exitCode = 1;
    } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.error("端口必须是 1–65535 的整数，例如 npm run preview -- --port=8788。");
        process.exitCode = 1;
    } else {
        const { server } = createPreviewServer();
        server.on("error", () => {
            console.error("预览服务启动失败，端口可能被占用；可使用 --port=8788 更换端口。");
            process.exitCode = 1;
        });
        server.listen(port, "127.0.0.1", () => {
            console.log(`本地预览：http://127.0.0.1:${port}`);
            console.log(
                "跟随 src/**/*.ts 与 scripts/substore/rename.ts；不执行测速，不保存订阅。Ctrl+C 退出。"
            );
        });
    }
}

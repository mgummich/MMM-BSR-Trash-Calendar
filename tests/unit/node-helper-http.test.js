import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const NODE_HELPER_FILE = path.resolve(TEST_DIR, "../../node_helper.js");
const requireFromNodeHelper = createRequire(NODE_HELPER_FILE);

function response({ status = 200, statusText = "OK", body = {}, url = "https://example.test/" }) {
  return {
    status,
    statusText,
    url,
    headers: {
      raw: () => ({}),
      entries: () => [],
    },
    json: async () => body,
    text: async () => String(body),
  };
}

function loadHelper(fetchMock) {
  const source = fs.readFileSync(NODE_HELPER_FILE, "utf8");
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "node_helper") {
      return { create: (definition) => definition };
    }
    if (request === "node-fetch") {
      return fetchMock;
    }
    return requireFromNodeHelper(request);
  };
  const wrapped = `(function (require, module, exports, __dirname, __filename) { ${source}\n})`;
  const script = new vm.Script(wrapped, { filename: NODE_HELPER_FILE });
  const fn = script.runInThisContext();
  fn(localRequire, module, module.exports, path.dirname(NODE_HELPER_FILE), NODE_HELPER_FILE);
  return module.exports;
}

describe("node_helper executeApiCall", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects redirect HTTP statuses by default", async () => {
    const helper = loadHelper(vi.fn().mockResolvedValue(response({ status: 302, body: "" })));

    await expect(helper.executeApiCall("https://example.test/redirect")).rejects.toThrow(
      "HTTP 302: OK"
    );
  });

  it("allows redirect HTTP statuses when requested", async () => {
    const helper = loadHelper(vi.fn().mockResolvedValue(response({ status: 302, body: "" })));

    await expect(
      helper.executeApiCall("https://example.test/redirect", {
        allowRedirectStatus: true,
        responseType: "text",
      })
    ).resolves.toBe("");
  });
});

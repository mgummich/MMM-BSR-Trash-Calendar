import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowsDir = ".github/workflows";
const workflowFiles = readdirSync(workflowsDir)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .map((file) => join(workflowsDir, file));

describe("workflow action pins", () => {
  it("pins every referenced action to a full lowercase commit SHA", () => {
    const usesLines = workflowFiles.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^\s*uses:\s*\S+/.test(line))
    );

    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(
        /^\s*uses:\s*[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[0-9a-f]{40}(?:\s+#.*)?\s*$/
      );
    }
  });
});

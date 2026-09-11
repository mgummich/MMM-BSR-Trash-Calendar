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

describe("release and wiki workflows", () => {
  it("creates GitHub releases from version tags that match package.json", () => {
    const releaseWorkflow = readFileSync(join(workflowsDir, "release.yml"), "utf8");

    expect(releaseWorkflow).toMatch(/tags:\s*\n\s*-\s*["']v\*["']/);
    expect(releaseWorkflow).toMatch(/contents:\s*write/);
    expect(releaseWorkflow).toContain(
      "uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4"
    );
    expect(releaseWorkflow).toContain("node-version-file: package.json");
    expect(releaseWorkflow).toContain('TAG_VERSION="${GITHUB_REF_NAME#v}"');
    expect(releaseWorkflow).toContain(
      `PACKAGE_VERSION="$(node -p \"require('./package.json').version\")"`
    );
    expect(releaseWorkflow).toMatch(/if \[ "\$TAG_VERSION" != "\$PACKAGE_VERSION" \]/);
    expect(releaseWorkflow).toContain(
      'gh release create "$GITHUB_REF_NAME" --generate-notes --title "$GITHUB_REF_NAME"'
    );
  });

  it("syncs the GitHub Wiki from main and only when wiki content changes", () => {
    const wikiWorkflow = readFileSync(join(workflowsDir, "wiki.yml"), "utf8");

    expect(wikiWorkflow).toMatch(
      /uses:\s*actions\/checkout@[0-9a-f]{40}\s*# v4\s*\n\s*with:\s*\n\s*ref:\s*main/
    );
    expect(wikiWorkflow).toMatch(/branches:\s*\n\s*-\s*main/);
    expect(wikiWorkflow).toMatch(/paths:\s*\n\s*-\s*["']wiki\/\*\*["']/);
    expect(wikiWorkflow).toMatch(/workflow_dispatch:/);
    expect(wikiWorkflow).toMatch(/contents:\s*write/);
    expect(wikiWorkflow).toContain("group: wiki-sync");
    expect(wikiWorkflow).toContain("cancel-in-progress: false");
    expect(wikiWorkflow).toContain(
      "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.wiki.git"
    );
    expect(wikiWorkflow).toContain('if ! compgen -G "wiki/*.md" > /dev/null; then');
    expect(wikiWorkflow).toContain(
      'echo "No Markdown files found in wiki/; existing GitHub Wiki content will not be deleted."'
    );
    expect(wikiWorkflow).toContain('if ! git clone "https://x-access-token:${GITHUB_TOKEN}');
    expect(wikiWorkflow).toContain(
      'echo "Unable to clone the GitHub Wiki. Enable the Wiki and create an initial placeholder page in GitHub\'s Wiki UI before re-running Sync GitHub Wiki."'
    );
    expect(wikiWorkflow).toContain("rm -f -- wiki-remote/*.md");
    expect(wikiWorkflow).toContain("cp wiki/*.md wiki-remote/");
    expect(wikiWorkflow).toContain("git add --all");
    expect(wikiWorkflow).toContain("git diff --cached --quiet");
    expect(wikiWorkflow).toContain('git commit -m "docs: sync GitHub Wiki"');
  });
});

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginDir } from "./test/harness.ts";

/** An agent file's frontmatter, parsed, and its body. */
function readAgent(name: string): { meta: Record<string, unknown>; body: string } {
  const file = join(pluginDir, "agents", `${name}.md`);
  expect(existsSync(file)).toBe(true);
  const match = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${file} has no frontmatter`);
  return { meta: Bun.YAML.parse(match[1]!) as Record<string, unknown>, body: match[2]! };
}

const userConfig = JSON.parse(readFileSync(join(pluginDir, ".claude-plugin", "plugin.json"), "utf8")).userConfig as Record<
  string,
  { default: string; options: string[] }
>;

const effortLevels = ["low", "medium", "high", "xhigh", "max"];
const settings = ["work", "judgement", "volume"];
const ending = "Spawned only by jrzstack playbooks.";
const readerDenies = ["Edit", "Write", "NotebookEdit"];

describe("jrzstack agents", () => {
  test("one writer and one reader serve every setting, beside Comment Sicko", () => {
    expect(readdirSync(join(pluginDir, "agents")).sort()).toEqual(["comment-sicko.md", "savvy-agent.md", "savvy-reader.md"]);
  });

  test("savvy-agent writes in the background, falling back to Work's defaults", () => {
    const { meta, body } = readAgent("savvy-agent");

    expect(meta.name).toBe("savvy-agent");
    expect(meta.model).toBe(userConfig.work_model!.default);
    expect(meta.effort).toBe(userConfig.work_effort!.default);
    expect(meta.background).toBe(true);
    expect(meta.disallowedTools).toBeUndefined();
    expect(meta.tools).toBeUndefined();
    expect(meta.description as string).toEndWith(ending);
    expect(body).toContain("read ${CLAUDE_PLUGIN_ROOT}/skills/savvy-mode/SKILL.md");
    expect(body).toContain("The Skill tool refuses them by design");
  });

  test("savvy-reader reads only, on the same fallback", () => {
    const { meta } = readAgent("savvy-reader");

    expect(meta.name).toBe("savvy-reader");
    expect(meta.model).toBe(userConfig.work_model!.default);
    expect(meta.effort).toBe(userConfig.work_effort!.default);
    expect(String(meta.disallowedTools).split(/,\s*/)).toEqual(readerDenies);
    expect(meta.tools).toBeUndefined();
    expect(meta.description as string).toEndWith(ending);
  });

  test("each setting's effort offers every level", () => {
    for (const setting of settings) expect(userConfig[`${setting}_effort`]!.options).toEqual(effortLevels);
  });

  test("Comment Sicko's description ends with the jrzstack-only line", () => {
    expect(readAgent("comment-sicko").meta.description as string).toEndWith(ending);
  });
});

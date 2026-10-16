import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

const settings = [
  { setting: "work", effort: "medium", model: "opus" },
  { setting: "judgement", effort: "high", model: "opus" },
  { setting: "volume", effort: "high", model: "sonnet" },
];

const ending = "Spawned only by pstack playbooks.";
const readerDenies = ["Edit", "Write", "NotebookEdit"];

describe("setting agents", () => {
  for (const { setting, effort, model } of settings) {
    test(`${setting} writes in the background on its setting's default model and effort`, () => {
      const { meta, body } = readAgent(setting);

      expect(meta.name).toBe(setting);
      expect(meta.model).toBe(model);
      expect(meta.model).toBe(userConfig[`${setting}_model`]!.default);
      expect(meta.effort).toBe(effort);
      expect(meta.effort).toBe(userConfig[`${setting}_effort`]!.default);
      expect(meta.background).toBe(true);
      expect(meta.disallowedTools).toBeUndefined();
      expect(meta.tools).toBeUndefined();
      expect(meta.description as string).toEndWith(ending);
      expect(body).toContain("read ${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/SKILL.md");
      expect(body).toContain("The Skill tool refuses them by design");
    });

    test(`${setting}-reader reads only, on the same model and effort`, () => {
      const { meta } = readAgent(`${setting}-reader`);

      expect(meta.name).toBe(`${setting}-reader`);
      expect(meta.model).toBe(model);
      expect(meta.effort).toBe(effort);
      expect(String(meta.disallowedTools).split(/,\s*/)).toEqual(readerDenies);
      expect(meta.tools).toBeUndefined();
      expect(meta.description as string).toEndWith(ending);
    });
  }

  test("each setting's effort offers every level", () => {
    for (const { setting } of settings) expect(userConfig[`${setting}_effort`]!.options).toEqual(effortLevels);
  });

  test("Comment Sicko's description ends with the pstack-only line", () => {
    expect(readAgent("comment-sicko").meta.description as string).toEndWith(ending);
  });
});

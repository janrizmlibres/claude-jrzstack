import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginDir, runProgram, tempDir, writeFiles } from "./test/harness.ts";
import { prSection, verificationRule, samplePlan } from "./test/plan-fixture.ts";

const launcher = join(pluginDir, "skills", "poteto-mode", "scripts", "run");

/** Lint `plan` with check-plan.mjs through the runtime launcher, as Multi-phase plan does. */
function checkPlan(plan: string) {
  const cwd = tempDir("pstack-plan-");
  writeFiles(cwd, { "plan.md": plan });
  return runProgram([launcher, "check-plan.mjs", "plan.md"], { cwd });
}

/** `plan` with `from` replaced by `to`, failing the test when `from` isn't there. */
function replace(plan: string, from: string, to: string): string {
  expect(plan).toContain(from);
  return plan.replace(from, to);
}

describe("check-plan.mjs", () => {
  test("passes a plan written in the port's wording and reports each PR section's boxes", () => {
    const result = checkPlan(samplePlan);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      [
        "Add backoff to the retry loop (R1)  boxes=23  files=2 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=0 merge=4",
        "Show the retry state in the status bar (R2)  boxes=26  files=2 build=1 you-see=1 verify-unit=1 verify-live=10 verify-perf=4 review-gate=3 merge=4",
        "2 PR sections, 0 problems",
        "",
      ].join("\n"),
    );
  });

  test("passes the skeleton Multi-phase plan tells the lead to copy", () => {
    const playbook = readFileSync(join(pluginDir, "skills", "poteto-mode", "playbooks", "multi-phase-plan.md"), "utf8");
    const skeleton = playbook.match(/^````markdown\n([\s\S]*?)^````$/m)?.[1];
    expect(skeleton).toBeDefined();

    const result = checkPlan(skeleton!);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toEndWith("1 PR sections, 0 problems\n");
  });

  test("exits 2 with its usage when no plan is given", () => {
    const result = runProgram([launcher, "check-plan.mjs"], { cwd: tempDir("pstack-plan-") });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("check-plan.mjs <plan.md>");
  });

  describe("flags upstream's wording where the port's differs", () => {
    test("a Read-at-program-start list taken from trunk with git show", () => {
      const plan = samplePlan.replaceAll("`${CLAUDE_PLUGIN_ROOT}/skills/", "`git show origin/main:pstack/skills/");

      const result = checkPlan(plan);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'plan.md:13: Program checklist lacks "${CLAUDE_PLUGIN_ROOT}/skills/poteto-mode/playbooks/"',
      );
    });

    test("live lanes on a model rather than the Volume setting's agent", () => {
      const plan = samplePlan.replaceAll("Ten lanes on `poteto-agent` on the Volume setting", "Ten lanes on `grok-4.7-xhigh-fast`");

      const result = checkPlan(plan);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Add backoff to the retry loop (R1): Verify, live lacks "Ten lanes on `poteto-agent` on the Volume setting at the PR head"',
      );
      expect(result.stderr).toContain(
        'Show the retry state in the status bar (R2): Verify, live lacks "Ten lanes on `poteto-agent` on the Volume setting at the PR head"',
      );
    });
  });

  describe("flags the faults upstream flags", () => {
    const faults: Record<string, [edit: (plan: string) => string, problem: string]> = {
      "a long dash": [(p) => replace(p, "Two PRs, R1 then R2.", "Two PRs — R1 then R2."), "plan.md:3: long dash"],
      "a curly quote": [(p) => replace(p, "the operator's click", "the operator’s click"), "curly quote"],
      "a mid-sentence colon": [(p) => replace(p, "Two PRs, R1 then R2.", "Two PRs: R1 then R2."), "plan.md:3: mid-sentence colon"],
      "no H1 title": [(p) => replace(p, "# Network retry plan", "Network retry plan"), "plan.md:1: no H1 title"],
      "an intro of ten lines": [
        (p) => replace(p, "Two PRs, R1 then R2.\n", "Two PRs, R1 then R2.\n" + "More.\n".repeat(9)),
        "intro is 10 lines, under ten required",
      ],
      "How to read this without its rule": [
        (p) => replace(p, `${verificationRule}\n\n## Program checklist`, "## Program checklist"),
        "How to read this lacks \"Tests alone are not sufficient verification.",
      ],
      "no How to read this": [(p) => replace(p, "## How to read this", "## Reading"), 'no "## How to read this" section'],
      "program sections out of order": [
        (p) => replace(p, "### Spawn owners", "### Owners"),
        'Program checklist lacks "### Spawn owners" in order',
      ],
      "no audit tick": [(p) => replace(p, "`/loop 1h`", "a timer"), 'Program checklist lacks "/loop 1h"'],
      "no status message": [(p) => replace(p, "status message", "note"), 'Program checklist lacks "status message"'],
      "sub-blocks out of order": [
        (p) => replace(p, "**Files.**", "**Build.**\n\n- [ ] Build first.\n\n**Files.**"),
        "Add backoff to the retry loop (R1): sub-blocks are [Depends on., Build., Files., Build.,",
      ],
      "an empty Depends on": [(p) => replace(p, "**Depends on.** None.", "**Depends on.**"), "(R1): Depends on names nothing"],
      "a sub-block with no box": [(p) => replace(p, "- [ ] Add `backoff` to `src/net/retry.ts`.\n", ""), "(R1): Build. has no box"],
      "a verify block not opening with the rule": [
        (p) => replace(p, "**Verify, unit.** Tests alone", "**Verify, unit.** Unit tests. Tests alone"),
        "(R1): Verify, unit. does not open with the rule",
      ],
      "nine lanes": [
        (p) => replace(p, "- [ ] Lane 10.", "- Lane 10."),
        "(R1): lanes are [1,2,3,4,5,6,7,8,9], expected 1 to 10",
      ],
      "a lane with no screenshot": [(p) => replace(p, "Save `retry-3.png`. ", ""), "(R1): lane 3 names no screenshot"],
      "a lane with no pass predicate": [
        (p) => replace(p, "Save `retry-4.png`. Pass when the client reconnects once.", "Save `retry-4.png`."),
        "(R1): lane 4 has no pass predicate",
      ],
      "perf boxes out of order": [
        (p) => replace(p, "- [ ] Probe. Drop", "- [ ] Probing. Drop"),
        "(R1): perf boxes are [Metric., Probing., Baseline., Rule.], expected [Metric., Probe., Baseline., Rule.]",
      ],
      "a review gate of None with boxes": [
        (p) => replace(p, "**Review gate.** None. R1 is not review-gated.", "**Review gate.** None. R1 is not review-gated.\n\n- [ ] Look."),
        "(R1): Review gate says None but has boxes",
      ],
      "a review gate with no video": [
        (p) =>
          replace(
            replace(p, "- [ ] Record a 30 to 60 second video of the change on a lane worker. Save it as `docs/media/R2-review.mp4`.\n", ""),
            "Post the screenshots and the video in chat.",
            "Post the screenshots in chat.",
          ),
        '(R2): Review gate lacks "video"',
      ],
      "no PR sections": [
        (p) => replace(p, prSection("Add backoff to the retry loop", "R1", "None.", false), "").replace(
          prSection("Show the retry state in the status bar", "R2", "R1.", true),
          "",
        ),
        "no PR sections between Program checklist and Close the program",
      ],
      "a section after Close that isn't an appendix": [
        (p) => replace(p, "## Appendix B. Alternatives rejected", "## Alternatives rejected"),
        '"## Alternatives rejected" after Close the program is not an appendix',
      ],
      "no prototype evidence appendix": [
        (p) => replace(p, "## Appendix A. Prototype evidence", "## Appendix A. Notes"),
        'no "## Appendix ... Prototype evidence" section',
      ],
    };

    for (const [name, [edit, problem]] of Object.entries(faults)) {
      test(name, () => {
        const result = checkPlan(edit(samplePlan));

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(problem);
      });
    }
  });
});

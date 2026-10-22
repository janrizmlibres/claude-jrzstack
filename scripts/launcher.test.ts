import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { git, pluginDir, runProgram, tempDir, writeFiles } from "./test/harness.ts";

const launcherPath = "skills/savvy-mode/scripts/run";
const missingRuntimeCode = 69;
const usageCode = 64;
const installLine = "curl -fsSL https://bun.sh/install | bash";

/** A PATH directory holding `bash` plus the given stubs, so no real runtime is found. */
function binWith(stubs: Record<string, string>): string {
  const bin = tempDir("jrzstack-bin-");
  symlinkSync(Bun.which("bash")!, join(bin, "bash"));
  writeFiles(
    bin,
    Object.fromEntries(Object.entries(stubs).map(([name, body]) => [name, { content: `#!/bin/sh\n${body}\n`, executable: true }])),
  );
  return bin;
}

const bunStub = 'echo "bun $*"';
/** A node stub reporting `version` to `--version` and echoing its arguments otherwise. */
const nodeStub = (version: string) => `if [ "$1" = --version ]; then echo ${version}; else echo "node $*"; fi`;

const launch = (bin: string, args: string[], plugin = pluginDir) =>
  runProgram([join(plugin, launcherPath), ...args], { cwd: tempDir("jrzstack-cwd-"), env: { PATH: bin } });

const scripts = join(pluginDir, "skills", "savvy-mode", "scripts");

describe("runtime launcher", () => {
  test("runs the script with Bun when Bun is present, resolving it beside the launcher", () => {
    const result = launch(binWith({ bun: bunStub, node: nodeStub("v24.15.0") }), ["orch/orch.ts", "init", "--x"]);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`bun --no-install ${scripts}/orch/orch.ts init --x\n`);
  });

  test("passes an absolute script path through and keeps the script's exit code", () => {
    const result = launch(binWith({ bun: 'echo "bun $*"; exit 3' }), ["/elsewhere/check-plan.mjs", "plan.md"]);

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("bun --no-install /elsewhere/check-plan.mjs plan.md\n");
  });

  test("resolves the script beside the launcher when called by a relative path with CDPATH set", () => {
    const cdpath = tempDir("jrzstack-cdpath-");
    mkdirSync(join(cdpath, "scripts"));

    const result = runProgram([Bun.which("bash")!, "scripts/run", "orch/orch.ts"], {
      cwd: join(pluginDir, "skills", "savvy-mode"),
      env: { PATH: binWith({ bun: bunStub }), CDPATH: cdpath },
    });

    expect(result.stdout).toBe(`bun --no-install ${scripts}/orch/orch.ts\n`);
  });

  test.each(["v22.18.0", "v22.21.1", "v24.2.0", "v24.15.0", "v25.0.0", "v26.1.0"])(
    "runs the script with Node %s when Bun is absent",
    (version) => {
      const result = launch(binWith({ node: nodeStub(version) }), ["orch/orch.ts", "init"]);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`node ${scripts}/orch/orch.ts init\n`);
    },
  );

  // Node strips types by default from 22.18 and 23.6, and has import.meta.main
  // from 22.18 and 24.2, so 23.x and 24.0-24.1 lack one of the two.
  test.each(["v22.17.1", "v20.19.5", "v23.11.1", "v24.1.0", "v18.20.8"])(
    "refuses Node %s with the missing-runtime code and the install line",
    (version) => {
      const result = launch(binWith({ node: nodeStub(version) }), ["orch/orch.ts", "init"]);

      expect(result.exitCode).toBe(missingRuntimeCode);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`found node ${version}, which lacks one of them`);
      expect(result.stderr).toContain(installLine);
    },
  );

  test("with neither runtime, exits with the missing-runtime code and the install line", () => {
    const result = launch(binWith({}), ["orch/orch.ts", "init"]);

    expect(result.exitCode).toBe(missingRuntimeCode);
    expect(result.stderr).toContain("run: orch/orch.ts needs Bun, or Node 22.18+ (24.2+ on Node 24)");
    expect(result.stderr).toContain(installLine);
  });

  test("exits with a usage error when no script is given", () => {
    const result = launch(binWith({ bun: bunStub }), []);

    expect(result.exitCode).toBe(usageCode);
    expect(result.stderr).toContain("usage: run <script> [args...]");
  });
});

describe("vendored commander", () => {
  /** The plugin's files as git would ship them, copied to a fresh directory like a marketplace install. */
  function installedPlugin(options: { withoutVendored?: boolean } = {}): string {
    const root = tempDir("jrzstack-install-");
    const repo = dirname(pluginDir);
    const files = git(repo, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "jrzstack")
      .split("\0")
      .filter(Boolean)
      .filter((file) => !(options.withoutVendored && file.includes("/node_modules/")));
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      copyFileSync(join(repo, file), join(root, file));
    }
    // copyFileSync keeps the mode bits, so the launcher stays executable.
    writeFiles(join(root, "jrzstack", "skills", "savvy-mode", "scripts"), {
      "probe/probe.ts": [
        'import { Command } from "commander";',
        "const program: Command = new Command();",
        'if (import.meta.main) console.log(program.name("probe").name(), import.meta.resolve("commander"));',
        "",
      ].join("\n"),
    });
    return join(root, "jrzstack");
  }

  const runtimes = { bun: process.execPath, node: Bun.which("node") };

  test.each(Object.keys(runtimes))("resolves from a plugin install under %s", (name) => {
    const binary = runtimes[name as keyof typeof runtimes];
    if (!binary) throw new Error(`${name} is not on PATH; these tests need Bun and Node 22.18+`);
    const bin = binWith({});
    symlinkSync(binary, join(bin, name));
    const plugin = installedPlugin();

    const result = launch(bin, ["probe/probe.ts"], plugin);

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("probe file://");
    expect(result.stdout).toContain(`${plugin}/skills/savvy-mode/scripts/node_modules/commander/`);
  });

  test.each(Object.keys(runtimes))("runs watch-pr from a plugin install under %s", (name) => {
    const binary = runtimes[name as keyof typeof runtimes];
    if (!binary) throw new Error(`${name} is not on PATH; these tests need Bun and Node 22.18+`);
    const bin = binWith({});
    symlinkSync(binary, join(bin, name));

    const result = launch(bin, ["watch-pr/watch-pr", "--help"], installedPlugin());

    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("Usage: watch-pr [options]");
  });

  test("Bun never installs commander on the fly when the vendored copy is missing", () => {
    const bin = binWith({});
    symlinkSync(process.execPath, join(bin, "bun"));
    const plugin = installedPlugin({ withoutVendored: true });

    const result = launch(bin, ["probe/probe.ts"], plugin);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Cannot find package 'commander'");
  });
});

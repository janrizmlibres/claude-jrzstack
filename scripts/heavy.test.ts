import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { pluginDir, tempDir } from "./test/harness.ts";

const heavy = join(pluginDir, "scripts", "heavy");
const busyCode = 75;
const missingLockCode = 69;
const usageCode = 64;

type Finished = { exitCode: number; stdout: string; stderr: string };

/** Start `heavy -- ...command` without waiting; `home` holds the machine lock. */
function start(
  home: string,
  command: string[],
  options: { waitSeconds?: number | string; path?: string; cwd?: string } = {},
) {
  const proc = Bun.spawn({
    cmd: [heavy, "--", ...command],
    cwd: options.cwd ?? home,
    env: {
      PATH: options.path ?? process.env.PATH ?? "",
      HOME: home,
      JRZSTACK_HEAVY_WAIT_SECONDS: String(options.waitSeconds ?? 30),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const finished: Promise<Finished> = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, exitCode]) => ({ exitCode, stdout, stderr }));
  return { proc, finished };
}

/** Resolve once `condition` holds, failing after `timeoutMs`. */
async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await Bun.sleep(25);
  }
}

/** A command that creates `marker` once it runs, then holds the lock by sleeping in the same process. */
const holdAfterTouching = (marker: string) => ["sh", "-c", 'touch "$1"; exec sleep 30', "sh", marker];

describe("heavy", () => {
  test("runs the command with its own output and exit code, and prints the wait", async () => {
    const home = tempDir("jrzstack-home-");

    const result = await start(home, ["sh", "-c", "echo out; echo err >&2; exit 3"]).finished;

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toBe("out\n");
    expect(result.stderr).toContain("err\n");
    expect(result.stderr).toContain("heavy: waited 0s for the machine lock");
  });

  test("two concurrent calls never overlap: the second waits for the first, from any directory", async () => {
    const home = tempDir("jrzstack-home-");
    const log = join(home, "log");
    const first = start(home, ["sh", "-c", 'echo first-start >> "$1"; sleep 2; echo first-end >> "$1"', "sh", log]);
    await until(() => existsSync(log));

    const second = start(home, ["sh", "-c", 'echo second-start >> "$1"; echo second-end >> "$1"', "sh", log], {
      cwd: tempDir("jrzstack-elsewhere-"),
    });
    const [one, two] = await Promise.all([first.finished, second.finished]);

    expect([one.exitCode, two.exitCode]).toEqual([0, 0]);
    expect(readFileSync(log, "utf8")).toBe("first-start\nfirst-end\nsecond-start\nsecond-end\n");
    expect(two.stderr).toContain("heavy: machine lock held, waiting up to 30s");
    expect(Number(two.stderr.match(/waited (\d+)s/)?.[1])).toBeGreaterThanOrEqual(1);
  });

  test("past the wait cap it exits with the busy code without running the command", async () => {
    const home = tempDir("jrzstack-home-");
    const holder = start(home, holdAfterTouching(join(home, "holding")));
    await until(() => existsSync(join(home, "holding")));

    const began = Date.now();
    const result = await start(home, ["touch", join(home, "ran")], { waitSeconds: 1 }).finished;
    const took = Date.now() - began;
    holder.proc.kill("SIGKILL");
    await holder.finished;

    expect(result.exitCode).toBe(busyCode);
    expect(result.stderr).toContain("heavy: machine lock still busy after 1s");
    expect(existsSync(join(home, "ran"))).toBe(false);
    expect(took).toBeGreaterThanOrEqual(900);
    expect(took).toBeLessThan(5000);
  });

  test("SIGKILL of the holder frees the lock", async () => {
    const home = tempDir("jrzstack-home-");
    const holder = start(home, holdAfterTouching(join(home, "holding")));
    await until(() => existsSync(join(home, "holding")));

    holder.proc.kill("SIGKILL");
    await holder.finished;
    const result = await start(home, ["true"], { waitSeconds: 2 }).finished;

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("heavy: waited 0s for the machine lock");
  });

  test("exits with a usage error when no command is given", async () => {
    const result = await start(tempDir("jrzstack-home-"), []).finished;

    expect(result.exitCode).toBe(usageCode);
    expect(result.stderr).toContain("usage: heavy -- <command> [args...]");
  });

  test("a heavy command that runs heavy again runs it under the lock it already holds", async () => {
    const home = tempDir("jrzstack-home-");

    const result = await start(home, ["sh", "-c", `"$1" -- echo inner; echo "inner exit $?"`, "sh", heavy], {
      waitSeconds: 1,
    }).finished;

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("inner\ninner exit 0\n");
  });

  test("refuses a wait that isn't a whole number of seconds rather than calling it busy", async () => {
    const home = tempDir("jrzstack-home-");

    const result = await start(home, ["touch", join(home, "ran")], { waitSeconds: "soon" }).finished;

    expect(result.exitCode).toBe(usageCode);
    expect(result.stderr).toContain("heavy: JRZSTACK_HEAVY_WAIT_SECONDS must be a whole number of seconds, not soon");
    expect(existsSync(join(home, "ran"))).toBe(false);
  });

  test("exits with its own code when the machine has neither flock nor perl", async () => {
    const home = tempDir("jrzstack-home-");
    const bin = tempDir("jrzstack-bin-");
    for (const tool of ["bash", "mkdir", "touch"]) symlinkSync(Bun.which(tool)!, join(bin, tool));

    const result = await start(home, ["touch", join(home, "ran")], { path: bin }).finished;

    expect(result.exitCode).toBe(missingLockCode);
    expect(result.stderr).toContain("heavy: needs flock or perl to take the machine lock");
    expect(existsSync(join(home, "ran"))).toBe(false);
  });
});

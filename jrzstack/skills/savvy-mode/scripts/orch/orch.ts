#!/usr/bin/env bun

import { Command, CommanderError } from "commander";
import { UsageError, publishBrief, publishPlan, type PublishedFile } from "./publish.ts";

interface Io {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

interface GlobalOptions {
  readonly json: boolean;
}

interface BriefPublishOptions {
  readonly branch: string;
}

interface PlanPublishOptions {
  readonly branch?: string;
  readonly title?: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emit(io: Io, json: boolean, row: PublishedFile): void {
  io.stdout(
    json ? `${JSON.stringify(row, null, 2)}\n` : `${row.branch}\t${row.path}\t${row.commit}\n`
  );
}

function requireSubcommand(): never {
  throw new UsageError("a valid command is required");
}

function leaf(parent: Command, name: string, description: string): Command {
  return parent.command(name).description(description).allowExcessArguments(false);
}

function createProgram(io: Io): Command {
  const program = new Command("orch")
    .description("Publish a plan or a brief to a branch by git plumbing")
    .usage("[--json] <command>")
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .exitOverride()
    .showHelpAfterError()
    .allowExcessArguments(false)
    .option("--json", "print the published row as JSON", false);
  const json = () => program.opts<GlobalOptions>().json;

  const plan = program.command("plan").description("post plans").action(requireSubcommand);
  leaf(plan, "publish <file>", "commit a plan as plan.md to its orphan branch and push it, never forced")
    .option("--branch <branch>", "branch to post to (default: jrzstack/plan/<file name without .md>)")
    .option("--title <title>", "commit title (default: the file name)")
    .action(async (file: string, options: PlanPublishOptions) => {
      emit(io, json(), await publishPlan({ file, branch: options.branch, title: options.title }));
    });

  const brief = program.command("brief").description("publish worker briefs").action(requireSubcommand);
  leaf(brief, "publish <file>", "commit a brief as briefs/<file name> to a branch and push it, never forced")
    .requiredOption("--branch <branch>", "branch to publish to, such as the plan's jrzstack/plan/<slug>")
    .action(async (file: string, options: BriefPublishOptions) => {
      emit(io, json(), await publishBrief({ file, branch: options.branch }));
    });

  program.action(requireSubcommand);
  return program;
}

function handleError(error: unknown, program: Command, io: Io): number {
  if (error instanceof CommanderError) {
    return error.exitCode === 0 ? 0 : 1;
  }
  io.stderr(`error: ${message(error)}\n`);
  if (error instanceof UsageError) {
    io.stderr(program.helpInformation());
  }
  return 1;
}

export async function main(
  argv: readonly string[],
  io: Io = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  }
): Promise<number> {
  const program = createProgram(io);
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    return handleError(error, program, io);
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}

#!/usr/bin/env bun
// check-cursorisms    flag Cursor-isms left in the port's translated files
//
// Run from the repo root. The patterns, their examples and the allowances all
// come from the conversion rules document, docs/conversion-rules.md. Every
// `## <n>. <title>` heading there is a rule, and every rule holds exactly one
// ```detect block of `key: value` lines:
//
//   pattern: <regex>       one or more, each matched against every line of a file
//   before: <line>         an upstream line the rule rewrites
//   after: <line>          the line the rule makes of it
//   allow: <port file> | <text on the line> | <reason>
//   undetectable: <reason> instead of all of the above, for a rule no line pattern can see
//
// Before scanning, the check self-tests the document: every pattern must
// match one of its rule's `before` lines (else it is dead), every `before`
// line must match one of its rule's patterns, and no `after` line may match
// any rule's pattern. An allowance excuses its rule's matches on the lines of
// one port file that contain its text, and must name one occurrence: one
// that excuses nothing is stale, and one that excuses several lines is too wide.
// Translated files are the port files port.json lists as neither an override,
// a port-only file nor a dropped one.
// Exit 0 when clean, 1 on Cursor-isms or stale allowances, 2 when the rules
// document fails its self-test, port.json is malformed, or on usage.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readPortRecord, translatedFiles } from "./lib/port.ts";
import { runCommand, UsageError } from "./lib/upstream.ts";

const rulesFile = "docs/conversion-rules.md";

type Allowance = { path: string; text: string; reason: string; docLine: number };

type Rule = {
  number: number;
  title: string;
  patterns: RegExp[];
  before: string[];
  after: string[];
  allowances: Allowance[];
  undetectable?: string;
};

type Finding = { file: string; line: number; column: number; rule: Rule; match: string; lineText: string };

function main(): number {
  const { positionals } = parseArgs({ options: {}, allowPositionals: true });
  if (positionals.length > 0) throw new UsageError("usage: check-cursorisms");

  const root = process.cwd();
  const rules = readRules(root);
  const files = translatedFiles(root, readPortRecord(root));

  // Each allowance's excused lines; one that excuses no line is stale, and one
  // that excuses several names more than one occurrence.
  const excused = new Map<Allowance, Set<number>>();
  const findings = files
    .flatMap((file) => scan(file, readFileSync(join(root, file), "utf8"), rules))
    .filter((finding) => {
      const allowance = finding.rule.allowances.find((a) => a.path === finding.file && finding.lineText.includes(a.text));
      if (allowance) excused.set(allowance, (excused.get(allowance) ?? new Set()).add(finding.line));
      return !allowance;
    });
  const allowances = rules.flatMap((rule) => rule.allowances.map((allowance) => ({ rule, allowance })));
  const stale = allowances.filter(({ allowance }) => !excused.has(allowance));
  const wide = allowances.filter(({ allowance }) => (excused.get(allowance)?.size ?? 0) > 1);

  for (const { file, line, column, rule, match } of findings) console.log(`${file}:${line}:${column}: ${ruleLabel(rule)}: ${match}`);
  for (const { rule, allowance: a } of stale) {
    console.log(`${rulesFile}:${a.docLine}: ${ruleLabel(rule)}: stale allowance, excuses nothing: ${a.path} | ${a.text}`);
  }
  for (const { rule, allowance: a } of wide) {
    const lines = [...excused.get(a)!].join(", ");
    console.log(
      `${rulesFile}:${a.docLine}: ${ruleLabel(rule)}: allowance excuses ${excused.get(a)!.size} lines (${lines}), ` +
        `give it text found on one: ${a.path} | ${a.text}`,
    );
  }
  const inFiles = new Set(findings.map((finding) => finding.file)).size;
  console.log(
    `${plural(findings.length, "Cursor-ism")} in ${inFiles} of ${files.length} translated files; ` +
      `${plural(excused.size, "allowance")} in use, ${stale.length} stale.`,
  );
  return findings.length + stale.length + wide.length === 0 ? 0 : 1;
}

const ruleLabel = (rule: Rule) => `rule ${rule.number} (${rule.title})`;
/** Whether `pattern` matches `text` anywhere; `search` ignores the global flag's `lastIndex`. */
const matches = (pattern: RegExp, text: string) => text.search(pattern) !== -1;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Every match of every rule's patterns in `content`, one per rule and column; none in a binary file. */
function scan(file: string, content: string, rules: Rule[]): Finding[] {
  if (content.includes("\0")) return [];
  return content.split("\n").flatMap((lineText, index) =>
    rules.flatMap((rule) => {
      const byColumn = new Map<number, string>();
      for (const pattern of rule.patterns) {
        for (const { index: at, 0: match } of lineText.matchAll(pattern)) {
          if (!byColumn.has(at + 1)) byColumn.set(at + 1, match);
        }
      }
      return [...byColumn]
        .sort(([a], [b]) => a - b)
        .map(([column, match]) => ({ file, line: index + 1, column, rule, match, lineText }));
    }),
  );
}

/** Parse the rules document and self-test it; any problem throws a UsageError listing them all. */
function readRules(root: string): Rule[] {
  const file = join(root, rulesFile);
  if (!existsSync(file)) throw new UsageError(`no conversion rules document at ${rulesFile} (looked in ${root})`);
  const errors: string[] = [];
  const fail = (line: number, message: string) => errors.push(`${rulesFile}:${line}: ${message}`);

  type Section = { rule: Rule; line: number; blocks: number };
  const sections: Section[] = [];
  let fence: { marker: string; detect: boolean; line: number } | undefined;

  for (const [index, text] of readFileSync(file, "utf8").split("\n").entries()) {
    const line = index + 1;
    const section = sections.at(-1);
    if (fence) {
      if (text.trim() === fence.marker) fence = undefined;
      else if (fence.detect && section) readKey(section.rule, text, line, fail);
      continue;
    }
    const opening = /^(`{3,}|~{3,})\s*(\S*)/.exec(text);
    if (opening) {
      const detect = opening[2] === "detect";
      fence = { marker: opening[1]!, detect, line };
      if (!detect) continue;
      if (!section) fail(line, "a detect block outside any rule");
      else section.blocks += 1;
      continue;
    }
    if (!text.startsWith("## ")) continue;
    const heading = /^## (\d+)\. (\S.*)$/.exec(text);
    if (!heading) {
      fail(line, `every ## heading must be a rule, \`## <n>. <title>\`: ${text}`);
      continue;
    }
    const number = Number(heading[1]);
    if (sections.some((s) => s.rule.number === number)) fail(line, `rule ${number} is numbered twice`);
    sections.push({
      rule: { number, title: heading[2]!.trim(), patterns: [], before: [], after: [], allowances: [] },
      line,
      blocks: 0,
    });
  }
  if (fence) fail(fence.line, "a code fence that never closes");

  for (const { rule, line, blocks } of sections) {
    if (blocks !== 1) fail(line, `${ruleLabel(rule)} needs exactly one detect block, has ${blocks}`);
    else selfTest(rule, line, fail);
  }
  const rules = sections.map((s) => s.rule);
  for (const { rule, line } of sections) {
    for (const after of rule.after) {
      for (const other of rules) {
        const hit = other.patterns.find((pattern) => matches(pattern, after));
        if (hit) fail(line, `${ruleLabel(rule)}: after line matches ${ruleLabel(other)}'s pattern ${hit.source}: ${after}`);
      }
    }
  }
  if (sections.length === 0) errors.push(`${rulesFile}: holds no rules`);
  if (errors.length > 0) throw new UsageError(`the conversion rules document fails its self-test:\n${errors.join("\n")}`);
  return rules;
}

/** Read one `key: value` line of a detect block into `rule`. */
function readKey(rule: Rule, text: string, line: number, fail: (line: number, message: string) => void): void {
  if (text.trim() === "") return;
  const pair = /^([a-z]+):(.*)$/.exec(text);
  if (!pair) return void fail(line, `not a \`key: value\` line: ${text}`);
  const [, key, raw] = pair as unknown as [string, string, string];
  const value = raw.trim();
  switch (key) {
    case "pattern": {
      let pattern: RegExp;
      try {
        pattern = new RegExp(value, "g");
      } catch (error) {
        return void fail(line, `pattern doesn't compile: ${(error as Error).message}`);
      }
      if (value === "" || matches(pattern, "")) return void fail(line, `pattern matches an empty line: ${value}`);
      rule.patterns.push(pattern);
      return;
    }
    case "before":
    case "after":
      if (value === "") return void fail(line, `an empty ${key} line`);
      rule[key].push(value);
      return;
    case "allow": {
      const first = value.indexOf("|");
      const last = value.lastIndexOf("|");
      const [path, text, reason] = [value.slice(0, first), value.slice(first + 1, last), value.slice(last + 1)].map((s) => s.trim());
      if (first === last || !path!.startsWith("jrzstack/") || text === "" || reason === "") {
        return void fail(line, "an allowance is `allow: <port file under jrzstack/> | <text on the line> | <reason>`");
      }
      rule.allowances.push({ path: path!, text: text!, reason: reason!, docLine: line });
      return;
    }
    case "undetectable":
      if (value === "") return void fail(line, "undetectable needs a reason");
      rule.undetectable = value;
      return;
    default:
      fail(line, `unknown key \`${key}\``);
  }
}

/** A rule's own examples against its own patterns. */
function selfTest(rule: Rule, line: number, fail: (line: number, message: string) => void): void {
  if (rule.undetectable !== undefined) {
    const extra = rule.patterns.length + rule.before.length + rule.after.length + rule.allowances.length;
    if (extra > 0) fail(line, `${ruleLabel(rule)} is undetectable, so it takes no pattern, before, after or allow`);
    return;
  }
  if (rule.patterns.length === 0) return void fail(line, `${ruleLabel(rule)} needs a pattern, or undetectable with a reason`);
  for (const pattern of rule.patterns) {
    if (!rule.before.some((before) => matches(pattern, before))) {
      fail(line, `${ruleLabel(rule)}: dead pattern, matches none of its before lines: ${pattern.source}`);
    }
  }
  for (const before of rule.before) {
    if (!rule.patterns.some((pattern) => matches(pattern, before))) {
      fail(line, `${ruleLabel(rule)}: before line none of its patterns match: ${before}`);
    }
  }
}

runCommand("check-cursorisms", main);

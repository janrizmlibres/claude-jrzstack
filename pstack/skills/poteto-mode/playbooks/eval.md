### Eval

**You own the experiment design. Plan, blind, run, synthesize.**

**Non-negotiables for blinding:**

- No `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, `sample`, or `arena` in any directory, file, or prompt the sample sees.
- The sample prompt looks like an organic user request. State the goal, not the meta.
- No chain-eliciting cues. Don't ask the sample to list which skills, principles, or files they applied. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory and slug names. Use project-shaped names a user might pick.
- Don't tell the sample other samples exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by variant or model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from samples.
2. **Set up sanitized environments.** Per-sample working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the sample would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Spawn the samples.** Every sample gets the same prompt: a sample is a measurement, not breadth, so identical prompts are the point and arena's distinct briefs don't apply. Run 3 samples per variant, and raise the count when the effect you're measuring is small next to the spread between samples of one variant. Each works in its own sanitized dir. Spawn them with `run_in_background: true` in one message, up to 10 in flight, and spawn the rest as earlier ones finish.
   - Run every sample on the model the change meets in use. A change to a role's skill or brief runs on that role's agent and setting, with `${user_config.<setting>_model}` as `model:` and `${user_config.<setting>_effort}` as `effort:`, or the setting's defaults for a literal placeholder or an empty value. A change to a skill the user invokes runs on your own model: the `general-purpose` agent with no `model:`, so it inherits yours, since `poteto-agent`'s pstack body would give the sample context a user's session lacks.
   - A cross-model sweep, the same samples on other models to see whether the change holds across them, is an opt-in cost check. Run it only when the user asks, and label it a cost check in the reply.
   - A sample that fails to produce output retries once on the same model and effort. If it fails again, proceed without it and note the dropout.
5. **Spawn one blind judge.** After every sample has returned, spawn one judge on `poteto-reader` on the Judgement setting, with `model:` `${user_config.judgement_model}` and `effort:` `${user_config.judgement_effort}`, or the setting's defaults (`opus`, `high`) for a literal placeholder or an empty value. Relabel every sample with a neutral label (X, Y, Z…), in an order unrelated to variant, and give the judge a copy with any variant name stripped. The judge gets the rubric and every sample by label, and scores all of them in one pass on one scale, criterion by criterion, citing the passage that earns each score. It never sees which variant or model produced a sample, nor your own scores.
6. **Verify the chain from transcripts, not self-report.** Read each sample's transcript under this session's `~/.claude/projects/<slug>/${CLAUDE_SESSION_ID}/subagents/`, where `<slug>` is the active workspace's absolute path with every character that isn't a letter or digit turned into "-". Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects. Look at which files each sample actually opened. Grade chain-following from the files it really read plus the shape of the code, never from the sample's own claims.
7. **Read every sample output yourself** end to end. Compare to the judge's verdict. Disagreement means the judge is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, the samples per variant and the model they ran on, per-sample notes, judge's verdict, your synthesis, dropouts if any, the sweep's results labelled a cost check when one ran, and a recommendation for whether to promote the variant.

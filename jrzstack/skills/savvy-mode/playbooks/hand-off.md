### Hand-off

**You pass the run on and keep no control. The cloud lead owns it from its first turn.** Hand off only when the request asks for it in so many words ("hand this off", "run it in the cloud"). A long run, a spec, or a user stepping away is not a request.

1. Check the surface. A hand-off goes from a local entry point to a cloud lead. On the cloud surface (`jrzstack: surface=cloud`) there is no local session to start, so say so once and run it here.
2. Push the input first, because a cloud session sees only what is on GitHub.
   - A spec issue is already there. Name its URL.
   - A repo file travels with the branch the run starts from. Commit it there if it isn't, and name its path.
   - A task given verbatim goes into the brief, word for word.
   - Push the branch the run starts from (`git push origin <branch>`), with the work this session already committed. Uncommitted changes don't travel. Commit them on that branch first, or name them in the brief as not done.
3. Fill the brief below, with `<owner>/<repo>` taken from `origin`. Keep every heading, in order. Write `None.` under a heading with nothing to say.
4. Start the cloud lead under a pseudo-terminal, with the brief as its prompt.
   - macOS. `script -q /dev/null claude --permission-mode auto --cloud "$(cat <brief.md>)"`
   - Linux. `script -qec "claude --permission-mode auto --cloud \"\$(cat <brief.md>)\"" /dev/null`

   `--cloud` takes the brief as its own argument, so it comes last, right before the brief. Put any other flag before it. When the request names a cloud environment, add `--settings '{"remote":{"defaultEnvironmentId":"<env_ id>"}}'` before `--cloud`. `--environment` takes only self-hosted ids.

   The cloud session clones the repo only when the Claude GitHub App is installed on the repo's owner. Otherwise the CLI uploads a bundle of the checkout, with no GitHub remote, and the command still prints a session link. A bundled lead can't push, so the brief's remote check ends that run at once.
5. On success, print the session link the command returned and end the run here. Don't poll the cloud session, watch its branches, or carry on locally.
6. On failure (no Auto on the account, no default cloud environment, a refused push, `claude` missing or signed out), say why in one sentence, once, and carry on locally under the playbook the task routes to. Never start the cloud session in another permission mode in its place. A cloud lead that is not in Auto stops on a click with no one watching.

````markdown
/jrzstack:savvy-mode

**Remote check.** Before anything else, run `git remote get-url origin`. If it fails, this session is a bundle with no GitHub remote and can push nothing: end the run at once with `BLOCKED: bundled session, no GitHub remote. Install the Claude GitHub App on <owner>/<repo> and hand off again.`, and do no other work.

**Input.** <The spec issue's URL, the pushed file's branch and path, or the task word for word.>

**Agreed since the spec.** <Every decision the user and this session settled after the spec was written, each in one sentence.>

**Already done.** <Where the plan is posted, if one is. Each pushed branch and what it holds.>

**Grants.** Go: <execute, or plan only>. Landing: <granted, or withheld>.

**Constraints.** <What the request or this session fixed for the run, such as local only, a base branch other than the default, or a waived panel.>
````

The go follows the request. A spec handed in is the go unless the request asked for a plan only. Landing is granted only when the request grants it.

**Reply:** the session link, what was pushed and where, and the brief's grants. After a failure, the one sentence why, and the local run's own reply.

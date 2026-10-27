# Roadmap: v1

This folder is a parallel roadmap. `GOAL.md` has the outcome. Each node is a folder under `nodes/`.

Rules for agents working on a node:

- Work only on your own node. Edit files inside your brief's owned paths and your own `nodes/<id>/` folder.
- Do not edit other briefs, `status` fields, contracts or `GOAL.md`. The orchestrator owns them.
- If a contract is wrong, write `contracts/<name>.change-request.md` and adapt locally. Do not edit the contract.
- Use only the numbers reserved in your brief for migrations, decision records and other numbered files.
- Keep notes in your `log.md`. Finish by writing `outcome.md` from the template.
- Read the outcomes of your direct dependencies. Do not read other nodes' logs.

Script: `python3 <skill>/scripts/plan.py <root> context <id>` lists the files to load for a node.

Project rules:

- Run the fast check from `GOAL.md` before finishing.
- The reference parser decides correct output. Compare against it in tests; do not reason from the CommonMark spec alone.
- Put each block or inline rule in its own file and register it in `src/blocks/index.ts` or `src/inline/index.ts`.
- Read code with `charCodeAt` and index loops. Do not split the input into line strings or use regular expressions in hot paths.

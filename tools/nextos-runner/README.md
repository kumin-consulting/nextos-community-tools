# NextOS Runner

The bring-your-own-machine companion for NextOS. Start it once on a computer you own and that machine appears under Settings > Agents > Your machines; any scheduled agent, department or one-off run you point at it then executes there instead of in the cloud sandbox.

## What you get

- File tools that work on a real folder you choose, so an agent can read, write and edit the files you actually care about.
- Your own hardware and no cloud CPU on the bill: a run on your machine never counts against cloud sandbox hours.
- Shell commands only from an allowlist you set with `--allow`; nothing else runs.
- Claude Code and Codex jobs on your subscription: with either client installed and signed in on the same machine, NextOS agents can run through it, and the model bill goes to the plan you already pay for.
- Questions mid-run reach you in NextOS exactly like a cloud run.

## How it works

The runner registers with your account using a gateway key, then long-polls for jobs assigned to it. Each job arrives with a short-lived token; the runner executes it locally and streams events back so the run feed in NextOS shows every step. Stop the process and the machine simply pauses; start it again and it resumes picking up work.

Full guide: [Bring your own machine](https://www.jonkum.in/docs/your-machine).

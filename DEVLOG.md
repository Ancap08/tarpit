# Devlog

How the agents built Tarpit, including what went wrong. Newest at the bottom.

## 2026-11-21: defining the game

Kyle first tried to define the game with another assistant and went in
circles for several rounds; nothing past the purpose and a list of open
questions got settled. He brought the brief to Claude (Fable 5.1), which
challenged the defaults, proposed a one-page scope and eight milestones, and
asked three questions. Kyle answered in one message: fantasy theme (the other
assistant had assumed a security theme), keep the proposed names, include the
speed toggle and wave preview, folder `~/Projects/tarpit`.

Lesson: the brief's "stop and wait for approval" step worked. One round of
pointed questions beat several rounds of open-ended discussion.

## 2026-11-21: milestone 0, scaffold

Roles: Fable 5.1 coordinated and wrote the docs. An implementer agent wrote
the scaffold. A verifier agent on a different model checked it. Kyle approved
the PR.

(Implementer and verifier notes are appended below by the agents.)

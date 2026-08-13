---
description: Worktree isolation for agents started via /worktree: sync with main worktree, stay in scope, validate before /apply-worktree
alwaysApply: false
---

# Cursor Worktree Agent Policy

## Purpose

This repository uses Cursor worktrees to allow a human to delegate independent tasks to agents while keeping changes isolated until they are ready to be integrated.

This policy applies only when a human explicitly requests a separate worktree for an agent using the `/worktree` command.

It does not define or restrict how Cursor or agents internally manage other forms of delegation or autonomous sub-agents.

The human remains responsible for:

- deciding which tasks should be assigned;
- defining priorities;
- managing deadlines;
- handling production issues and urgency;
- deciding when a change should be accepted.

Agents are responsible for implementing the assigned task and ensuring that their changes can be safely integrated.

---

## Worktree Creation

When a human starts an agent using `/worktree`:

1. The agent must operate inside the isolated worktree created for that task.
2. The agent must not directly modify the main worktree while developing the requested change.
3. The worktree exists to isolate the agent's modifications until they are ready to be applied.

The worktree is an implementation detail.

The human should continue using the main Cursor workspace and interact with the agent through Cursor's normal workflow.

---

## Initial Synchronization

Before starting any modification, the agent must synchronize its worktree with the current state of the main worktree.

The synchronization must include all changes currently present in the main worktree, including:

- committed changes;
- staged but uncommitted changes;
- unstaged changes;
- new files not yet tracked by Git.

The agent should only start implementing the requested task after this synchronization has completed successfully.

---

## Agent Task Scope

Agents should focus on their assigned modifications.

Agents should minimize unnecessary changes outside their assigned task scope.

Agents should avoid unrelated:

- refactoring;
- formatting changes;
- code cleanup;
- improvements;

unless explicitly requested by the human.

---

## Preparing a Worktree for Application

Before requesting that its changes are applied to the main worktree using `/apply-worktree`, the agent must ensure that its changes are compatible with the current main worktree.

The agent must:

1. Synchronize its worktree with the latest main worktree state.
2. Include all main worktree changes, whether committed or not committed.
3. Reapply its own changes on top of the updated state.
4. Resolve conflicts if they occur.
5. Run relevant validation steps.

If synchronization causes problems, including:

- merge conflicts;
- failed tests;
- broken builds;
- incompatible assumptions;

the agent must revise its implementation and repeat the synchronization and validation process before requesting `/apply-worktree`.

---

## Multiple Worktrees Waiting for Application

Multiple agents may have completed their work and be waiting for `/apply-worktree`.

The human may apply worktrees sequentially.

After another agent's worktree has been applied to the main worktree, any remaining agents that have not yet been applied must consider their previous synchronization state invalid.

Before their own `/apply-worktree`, they must:

1. Synchronize their worktree with the new main worktree state.
2. Include all changes now present in the main worktree, including uncommitted changes.
3. Reapply their own modifications.
4. Resolve any conflicts.
5. Repeat validation.

If the resulting changes are materially different from the previously reviewed version, the agent must request a new human review before applying the worktree.

---

## Applying Worktrees

The `/apply-worktree` command represents the human approval event for integrating an agent's changes.

Before applying a worktree:

- the agent's changes should already have been validated against the latest main worktree state;
- conflicts should already have been resolved;
- required tests should have passed.

The goal is that `/apply-worktree` integrates a change that is already known to be compatible with the current project state.

---

## Autonomous Agents

This policy does not apply to agents that are not explicitly started by a human using `/worktree`.

For autonomous agents or sub-agents, Cursor and the agent orchestration system may choose the most appropriate execution strategy.

Possible strategies include:

- using the current environment;
- creating additional worktrees;
- sharing context;
- using other isolation mechanisms.

The choice depends on task requirements and execution efficiency.

---

## Main Worktree

The main worktree represents the integration point.

It may contain:

- reviewed changes;
- applied agent changes;
- local modifications being prepared for integration.

The main worktree state includes both committed and uncommitted changes.

Agents working through `/worktree` must treat all current main worktree changes as part of the integration baseline.

---

## General Principle

The `/worktree` command creates an isolated environment for a human-assigned task.

The purpose of isolation is to allow multiple agents to work in parallel while keeping integration controlled.

Task selection, priorities, and acceptance decisions remain human responsibilities.

Agents are responsible for producing changes that remain compatible with the evolving main worktree state before integration.

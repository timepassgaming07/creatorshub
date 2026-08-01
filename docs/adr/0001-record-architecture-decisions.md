# ADR-0001 — Record architecture decisions

**Status:** Accepted
**Date:** 2026-07-27

## Context

The manifesto requires that engineering reasoning be documented and that CreatorHub be built for
an engineering organisation that does not exist yet. Both point to the same need: decisions must
outlive the conversation that produced them.

The specific failure this prevents is the one every codebase eventually suffers — an engineer
finds a constraint that looks arbitrary, cannot find why it exists, and either works around it
(reintroducing the original problem) or removes it (reintroducing the original bug).

## Options considered

**Comments in code.** Local and discoverable, but they cannot express a decision that spans
modules, and they cannot record the options that were rejected.

**A wiki.** Easy to write, but drifts from the code and is not reviewed alongside changes.

**ADRs in the repository.** Versioned with the code, reviewed in pull requests, greppable, and
diffable. The cost is discipline.

## Decision

ADRs live in `docs/adr/`, are numbered sequentially, and are written for decisions that are
expensive to reverse. They are reviewed as part of the pull request that implements them.

Immutability is the rule: an accepted ADR is never edited to reflect a new opinion. It is
superseded by a new record.

## Consequences

- Some decisions get written up and then reversed. That is fine and the record is still useful.
- There is a judgement call about what deserves an ADR. The test: *would a competent engineer
  arriving in a year be puzzled by this, and would guessing wrong be costly?*
- Reviewing an ADR takes longer than reviewing code. Accepted.

## Revisit when

Never. This one is structural.

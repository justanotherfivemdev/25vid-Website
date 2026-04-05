# Server Diagnostics Improvement Plan

## Goal

Turn the server diagnostics area into a resolution-finding system instead of a raw error inbox.

The diagnostics experience should let operators:

- distinguish actionable failures from harmless recurring noise
- mark known-safe and expected errors without deleting evidence
- preserve operator review and rationale over time
- narrow searches by source, category, scope, actionability, and verdict
- build a reusable knowledge base for future incident triage

## Current State Summary

The current implementation already has strong building blocks:

- `log_monitor` fingerprints and groups log errors into `log_error_types` and `log_occurrences`
- the unified diagnostics page merges live errors, error patterns, mod issues, and alerts
- `mod_issues` and `server_detections` already support operator verdicts including `false_positive`
- docs already define source-aware categorization and false-positive review expectations

The main gap is that raw log-monitor data does not yet support the same review and curation workflow as mod issues and detections.

## Main Problems To Solve

- `log_error_types` stores counts and examples, but not review state, rationale, scope, or suppression rules
- `log_monitor` routes support search and alert resolution, but not pattern-level review or classification
- the diagnostics UI lets operators mark mod issues as `false_positive`, but not raw error patterns or occurrences
- false positives, known-safe errors, and expected startup noise are currently treated as the same class of problem
- alerts can still fire on signatures that may be noisy but understood
- search is still too narrow for fast triage because it lacks filters like source stream, actionability, and review state

## Core Design Principle

Do not use one field to mean three different things.

We should separate:

- `review_status`: what the operator decided
- `classification`: what kind of issue it is
- `actionability`: whether it should appear in the default working set

That distinction is important because:

- a `false_positive` means the detection itself was wrong
- a `known_safe` error may be real, but not actionable
- an `expected_restart` error may be real, temporary, and acceptable
- a `known_vanilla` script error may be real, recurring, and useful for correlation, but not something admins should chase

## Proposed Data Model

Build on the current Mongo collections instead of replacing them.

### 1. New `diagnostic_rules` collection

This becomes the smart curation layer.

Suggested fields:

- `id`
- `name`
- `enabled`
- `priority`
- `scope_type`: `global`, `server`, `mod`, `environment`
- `scope_value`
- `match_type`: `fingerprint`, `normalized_regex`, `raw_regex`, `category`, `source_category`
- `fingerprint`
- `normalized_regex`
- `raw_regex`
- `category`
- `source_stream`
- `source_category`
- `mod_guid`
- `server_id`
- `startup_only`
- `classification`: `unknown`, `known_safe`, `known_vanilla`, `expected_restart`, `admin_generated`, `mod_related`, `config_related`, `infra_related`
- `actionability`: `actionable`, `monitor`, `ignore_by_default`
- `review_status`: `active`, `monitoring`, `resolved`, `false_positive`
- `suppress_new_type_alert`
- `suppress_rate_alert`
- `suppress_default_view`
- `recommended_actions`
- `rationale`
- `created_by`
- `updated_by`
- `review_due_at`
- `expires_at`
- `hit_count`
- `last_matched_at`

### 2. Extend `log_error_types`

Add durable operator and classification metadata:

- `review_status`
- `classification`
- `actionability`
- `rule_id`
- `verdict_notes`
- `reviewed_by`
- `reviewed_at`
- `source_streams`
- `source_category`
- `is_core_game`
- `suppress_default_view`
- `suppress_alerts`

### 3. Extend `log_occurrences`

Store the classification snapshot used when the line was ingested:

- `source_stream`
- `source_path`
- `classification_snapshot`
- `actionability_snapshot`
- `review_status_snapshot`
- `rule_id`
- `session_phase`

`session_phase` should eventually distinguish startup, steady-state, shutdown, and recovery cycles so expected boot noise does not pollute normal runtime diagnostics.

## API Plan

### Extend log-monitor APIs

- `GET /log-monitor/errors`
  - add filters for `review_status`, `classification`, `actionability`, `source_stream`, `source_category`, `include_suppressed`
- `GET /log-monitor/error-types`
  - add the same filters plus `reviewed_by`, `is_core_game`, and `rule_id`
- `GET /log-monitor/alerts`
  - include suppression metadata and linked rule context when present

### Add review endpoints

- `GET /log-monitor/error-types/{id}`
- `PATCH /log-monitor/error-types/{id}`
- `POST /log-monitor/error-types/{id}/review`
- `POST /log-monitor/error-types/{id}/promote-rule`

### Add rule-management endpoints

- `GET /diagnostics/rules`
- `POST /diagnostics/rules`
- `PATCH /diagnostics/rules/{id}`
- `POST /diagnostics/rules/{id}/disable`

## Ingestion And Alerting Changes

Update the log pipeline so curation applies automatically on future matches.

### Ingest flow

1. Parse the line and build the fingerprint as today.
2. Look up any matching `diagnostic_rules`.
3. Apply the highest-priority matching rule.
4. Store the occurrence with the applied classification snapshot.
5. Update the error type with rolled-up rule and review metadata.
6. Only raise default alerts when the resulting actionability is still actionable.

### Alert behavior

- new signatures should still be recorded even if hidden from default views
- known-safe signatures should not trigger "new type" alerts after they are curated
- rate alerts should be suppressible per rule
- alert records should explain whether suppression happened and why

## UI And Workflow Plan

### Diagnostics page upgrades

Add curation controls directly to the `Error Patterns` tab and detail dialog:

- mark as `active`, `monitoring`, `resolved`, or `false_positive`
- classify as `known_safe`, `known_vanilla`, `expected_restart`, `admin_generated`, or `needs_investigation`
- choose scope:
  - global
  - this server only
  - this mod only
- require rationale for safe/noise classifications
- optionally add expiry or review date

### Live Errors tab upgrades

- default to hiding `ignore_by_default` noise
- add a visible toggle to include suppressed noise
- show badges for:
  - review status
  - classification
  - source stream
  - core game vs mod attribution
- allow quick filtering for:
  - RCON / BattlEye
  - runtime script
  - engine/base game
  - startup-only noise
  - actionable-only

### Cross-linking

Each error pattern should be able to link to:

- related mod issues
- related watcher detections
- related incident or note
- recommended actions
- a curated operator note explaining why the issue is safe or expected

## Suggested Classification Presets

These should be one-click presets in the UI because they match the exact pain points called out for this feature.

- `Known safe vanilla script error`
- `Expected during startup or restart`
- `Expected RCON or BattlEye disconnect noise`
- `Known admin-generated event`
- `Known mod issue under monitoring`
- `Needs investigation`

## Search And Reporting Improvements

The search model should answer "what should I work right now?" before "show me every line."

Add filters and reports for:

- unreviewed signatures
- actionable signatures
- hidden-safe signatures
- by source stream
- by classification
- by server
- by mod
- by recurrence count
- by first-seen and last-seen range
- by operator reviewer

Add summary cards for:

- unknown signatures this week
- top noisy safe signatures
- top actionable signatures
- signatures most often marked false positive
- mean time to first review
- mean time from first-seen to resolution

## Seed Rules For First Rollout

Ship the system with a first-pass curated ruleset instead of waiting for operators to build it from zero.

Suggested seed areas:

- known BattlEye or RCON timeout and disconnect noise
- expected restart-cycle lines
- common base-game script spam already known to be harmless
- workshop-download transients that are only actionable when persistent
- admin command echoes and moderation actions

The initial seed set should be derived from the existing server docs and observed live data.

## Rollout Plan

### Phase 1: Data foundation

- add `diagnostic_rules`
- extend `log_error_types`
- extend `log_occurrences`
- add indexes for new filter paths
- backfill existing documents with defaults

### Phase 2: Rule-aware ingestion

- apply rule matching during `ingest_log_line`
- preserve rule snapshots on occurrences
- suppress alerts based on curated actionability
- add tests for matching precedence and suppression

### Phase 3: Diagnostics curation UI

- add pattern review controls
- add rationale fields
- add hidden-noise toggles and new filters
- surface classification badges in tables and dialogs

### Phase 4: Analytics and knowledge layer

- add reporting for unknown vs curated signatures
- rank issues by actionability and recurrence
- surface related notes, incidents, and proven fixes

### Phase 5: Cleanup

- remove or fully retire any leftover duplicate log-monitor-only UI once the unified diagnostics page is the single supported workflow

## Acceptance Criteria

This work is done when:

- operators can mark a raw error pattern as false positive, known safe, or expected noise
- the same fingerprint keeps that review state on future matches
- curated safe signatures stop polluting default alerts and default views
- suppressed signatures remain searchable and auditable
- RCON, runtime script, engine, and mod-related issues can be filtered independently
- every manual curation action stores who changed it, when, and why
- tests cover rule matching, backfill behavior, alert suppression, and new filters

## Recommended First Implementation Slice

If we want the fastest high-value version first, ship this order:

1. Add `review_status`, `classification`, `actionability`, and `verdict_notes` to `log_error_types`.
2. Add a small `diagnostic_rules` collection scoped only by fingerprint.
3. Add pattern review controls to the `Error Patterns` tab.
4. Hide `ignore_by_default` patterns from the default diagnostics view.
5. Suppress "new type" alerts for curated safe signatures.

That gets us the first smart-database behavior without having to solve every advanced rule scope in the first release.

# ADR-004 — separate core, demo and test environments
Status: accepted for implementation.

Context: company mandates 3 resources and 4 users for clean acceptance, owner wants 12–15 resources with varied companies; accepted handoff has 15 resources, 7 users and 11 requests. Simulator stores live ops in memory.
Decision: core default exact data, no requests; demo in separate Compose project/DB/provider; demo historical completed/rejected rows explicitly labeled fixtures, processing real queued job, attention bootstrap real provider op only in demo; isolated test stack. Idempotent seeding, explicit reset only. See architecture doc.
Alternatives: one DB with mixed fixtures, reset on boot, fabricate provider stats. These disrupt acceptance/recovery and confuse history with runtime evidence.
Consequences: additional seed tooling, coherent fixture labels, separate ports/projects. Never present synthetic history as live provider proof. Demo bootstrap and isolation tested separately.

Update 2026-11-12: the owner explicitly requested more default-Core data. ADR-009 supersedes only the Core catalogue size: 18 resources (15 Alpha / 3 Beta). Core/demo/test isolation, insert-only seed policy, original resource values and provider guarantees remain in force. The minimal 3-resource acceptance fixture remains available as DATASET=test.

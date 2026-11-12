# ADR-001 — PostgreSQL durable jobs instead of RabbitMQ
Status: accepted for implementation.

Context: company requires approval+task atomicity and recovery, explicitly no own broker required. Owner considered RabbitMQ to demonstrate delivery reliability.
Decision: modular monolith + separate worker, PostgreSQL job table written in same transaction as approval, unique request job, SKIP LOCKED, leases/fencing, persisted phases. No broker. Provider idempotency prevents duplicate external effect under its contract; DB transactions protect local effect.
Alternatives: RabbitMQ + transactional outbox + publisher confirmations/consumer idempotency; Redis queue; in-memory timers. Broker adds cross-system delivery/outbox complexity; memory queue loses jobs. PostgreSQL sufficient for this scale.
Consequences: polling and DB job management, bounded retries and lease complexity; monitor queue in future. Not global exactly-once. See reliability doc; reassess broker only with independent consumers/high-volume needs.

# ADR-002 — independent provider container, unchanged original
Status: accepted for implementation.

Context: original simulator binds loopback, stores operations in process memory, first POST returns 503 after effect. Restarting it loses operations.
Decision: copy source unchanged; launcher imports Handler and binds 0.0.0.0 inside isolated Docker network. API/worker use provider:8091. Compose starts provider independently; restart test stops/restarts only API/worker, preserving DB and provider. Fault injection uses separate test stub.
Alternatives: Python subprocess inside API; edit original script; host-network only. These couple lifecycles, harm reproducibility or change source.
Consequences: separate service, reproducible main test, no claim of recovery across provider restart. Document explicit resets and in-memory boundary.

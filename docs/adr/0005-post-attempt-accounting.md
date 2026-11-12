# ADR-005 — durable POST reservations and conservative crash accounting
Status: accepted for implementation.

Context: counter persistence and external network send cannot share an atomic transaction. Crash can occur after reservation before send, or after effect before response persistence. Company requires max three POST attempts per cycle and GET not counted.
Decision: reserve possible POST slot before send, persist check phase/next_run_at; recovery GET first even on third slot. Count ambiguous reservation conservatively as possibly sent. Never silently send untracked fourth POST. Manual retry resets cycle only, same key/payload. UI distinguishes reservation and observed response. See reliability doc.
Alternatives: increment only after response (undercount after crash), retry same untracked slot (can exceed bounded sends), distributed transaction (not available). Conservative reservation is safe and observable, but may reach attention with fewer observed sends.
Consequences: GET-first reconciliation, explicit tests for crash before send, documented limitation; no automatic external replay after confirmed result if local mismatch.

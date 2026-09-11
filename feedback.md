# CALL-E feedback

## 2026-09-11 T1.4 bounded probe

### Provider evidence

- The first create request returned HTTP 422 for an invalid `recipients` shape. It returned no CallTask id.
- One corrected request was accepted as `call_jDAvO3ThAO5Fa2kBPCmV6A`.
- The accepted task ended with `status: failed` and `failure_code: call_failed`.
- Its `failure_message` was `calling task status=NO ANSWER (Hangup by: bot)`.
- The API response and event retrieval returned no cost amount.
- The probe configured no webhook endpoint. No webhook body or headers were captured.

### Operator report

- The operator reported two rings after the one accepted CallTask.

### Unconfirmed interpretation

- Orma issued no second accepted dispatch. The cause of the second ring is unconfirmed and may be provider attempt behavior for the same CallTask.

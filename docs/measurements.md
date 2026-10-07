# What was measured

Timings and costs observed on the dev cluster. They are observations of this
demo on one machine, not pilot evidence for the architecture decision. Sizes
and timings of a single platform service are in its README (see
[`cluster.md`](cluster.md)); a component's are in its own.

## The core path

- Break to failing search 4.7 s; apply to recovered search about
  5 s; model calls 1 to 4 s, 6 s for a chat answer with tool calls. Agents
  give a model call one total deadline (`MODEL_TIMEOUT_SECONDS`) and no retry.

## The full incident

Driven by the real alert, three runs, seconds from `demo:break`:

| Moment | Seconds |
|---|---|
| Alertmanager calls the hook | 22 |
| Incident card visible ("Diagnosing...") | 22 to 23 |
| Diagnosis shown on the card | 39 to 41 |
| Apply clicked to resolved | 7 |
| Alert clears after the fix | 31 to 33 |

- `diagnosis-agent` uses three observability tools (Prometheus, Tempo, Loki)
  besides its cluster tools; a diagnosis takes 14 to 15 seconds.
- `demo:drive` uses the real alert by default; `demo:alert` is a fallback.
  `demo:reset` restarts `chat-assistant` and waits for the alert to clear (up
  to 35 seconds). A second break opens a new incident.
- **Tempo:** one trace per request. The alert, hook, incident, diagnosis and
  its model calls are one trace. Each button click is one trace through the
  gateway, `chat-assistant`, the agent, `delivery-mcp`, the search check and
  the model call. Clicks, card polls and the alert are separate traces, and
  the browser emits no span.
- **Langfuse:** one generation per model call, with tokens, the verified
  user and cost (prices and their source in
  `agent-deployments/clusters/dev/platform/50-langfuse/model-prices.json`). An incident is several traces,
  not one. Propose and approve call no model, so they do not appear, and the
  diagnosis is attributed to the workload, not a user. About $0.15 an
  incident.
- Components when this was measured: Python components 0.1.1,
  `chat-assistant` 0.1.6, `web` 1.0.0. The cluster now runs `chat-assistant`
  0.1.9 and `web` 1.2.1, whose pages were redrawn since. The numbers on this
  page are from before that.

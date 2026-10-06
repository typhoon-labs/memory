---
name: search-service-runbook
description: Runbook for an alert on the Sample App's search-service. Use it whenever an alert or a question names search-service, failing searches, or errors on /search or /api/search. It says what to read, in which order, and how to decide which version to recommend.
---
## Runbook: search-service

### What it is

- Deployment `search-service` in namespace `sample-app`, owned by team `search`. It answers `GET /search?q=`; the `web` service calls it for `/api/search`.
- One container. Its image is `<registry>/search-service:<version>`, and the image tag is the version. The behaviour of a version is fixed in its image: there is no setting, flag or ConfigMap that changes it.
- `/healthz` answers 200 even when every search fails. A pod that is Running and Ready with no restarts is therefore not proof that the service works. Only its log is.
- The log is JSON, one object per line. Every request is one line with `"msg":"request"` and its `status`. A failed search adds a line with `"level":"error"` and `"msg":"search failed"`, carrying `error_type`, `error` and `stack`.

### Steps

1. **What runs, and what is retained.** In one step, ask for three lists in namespace `sample-app`: the Deployment `search-service` in wide output, the ReplicaSets in wide output, and the pods.
   - The Deployment's image tag is the current version.
   - Each ReplicaSet named `search-service-...` is one version the Deployment has run. The one with replicas is the current version. Those with 0 replicas are retained versions it can return to, each with its image tag and age.
   - The current pod is the `search-service-...` pod that is Running, not one that is Terminating. Its age is the time since the last rollout.
2. **Is the current version failing?** Read the last 40 log lines of the current pod. Count the lines with `"level":"error"` and the request lines by `status`. If there are errors, copy the first `error_type` and `error` exactly, and the first line of `stack` that names a file of the service.
3. **Only if a pod is not Running, or you need the time of a rollout:** describe the Deployment, or the pod. The events at the end of the description say what happened and when.
4. **How many requests fail, and on which version** (only if you have the tools `query_prometheus` and `search_tempo_traces`). Ask for both in the same step as the log of step 2, never in a step of their own, and send each query exactly as written:
   - `query_prometheus` with `datasourceUid` `prometheus`, `queryType` `instant`, `endTime` `now`, and `expr`
     `sum by (version, status) (round(increase(http_requests_total{service_name="search-service", route="/search"}[10m])))`.
     The result is the number of searches in the last 10 minutes, by version and HTTP status.
   - `search_tempo_traces` with `datasourceUid` `tempo` and `query`
     `{resource.service.name="search-service" && status=error} | select(resource.service.version)`.
     Each trace is one failed request. Read the first two only: note one `traceID` and the version on its span.
   - Loki (`query_loki_logs`) holds the gateway's access log, not this service's log. Do not query it for this service; its own log is the pod's (step 2).

### How to decide

The alert says something was wrong when it fired. Only the log of the current pod says whether something is wrong now. Decide in this order:

1. **The current pod's log has no error lines and its requests answer 200.** The current version is not failing. Say so, and recommend the current version. If a retained ReplicaSet shows that another version ran recently, say that the alert probably fired before a rollback finished. Never recommend leaving a version whose log shows no errors, whatever the alert or the caller says.
2. **The current pod's log has errors that come from the service's own code** (the stack names a file under `search-service/`). The release of the current version is the suspected cause. Recommend a retained version: a `search-service` ReplicaSet with 0 replicas and a different image tag. If there are several, take the one with the highest `deployment.kubernetes.io/revision` annotation. Name the version you saw, not one you expect.
3. **A pod does not start** (`ImagePullBackOff`, `CrashLoopBackOff`, `Pending`). The cause is what its events and status say; quote them. Recommend the retained version that last ran.
4. **The current version is failing and no other version is retained.** There is nothing to return to: `recommended_version` is `null`.

### What not to recommend

- A restart. The same image fails the same way.
- A configuration change. The service has none that affects search.

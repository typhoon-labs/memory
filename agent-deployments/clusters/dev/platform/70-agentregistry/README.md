# Agentregistry

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against the Agentregistry chart 0.4.0

As built in the dev cluster. The release is in `helmfile.yaml`.

- Agentregistry (chart 0.4.0) in `agentregistry`, UI at
  `http://localhost:18086`, about 55 MiB. Entries are `ar.dev/v1alpha1` YAML
  (`Agent`, `MCPServer`, `Skill`) in each component's `catalog.yaml`
  (`components/<name>/catalog.yaml`; for a server that is not one of our
  components, its workload's),
  published with `task registry:publish`. The catalog is empty until that
  runs. It is a catalog only: the server has no cluster credentials. Other
  tasks: `registry:install`, `registry:arctl`, `registry:status`,
  `registry:uninstall`.
- **No entry is a `Skill`.** Agentregistry 0.4.0 takes a Skill's source as a
  git repository only, and `diagnosis-agent`'s runbook skill is an OCI image
  in a repository with no remote. A Skill without a source stays
  Ready=False, `SourceMissing` (tried on 2026-11-02; `scripts/publish.sh`).

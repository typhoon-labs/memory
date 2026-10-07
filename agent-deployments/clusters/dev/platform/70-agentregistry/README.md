# Agentregistry

As built in the dev cluster. The release is in `helmfile.yaml`.

- Agentregistry (chart 0.4.0) in `agentregistry`, UI at
  `http://localhost:18086`, about 55 MiB. Entries are `ar.dev/v1alpha1` YAML
  (`Agent`, `MCPServer`, `Skill`) in each component's `catalog.yaml`
  (`components/<name>/catalog.yaml`; for a server that is not one of our
  components, its workload's),
  published with `task registry:publish`. The catalog is empty until that
  runs. It is a catalog only: the server has no cluster credentials.

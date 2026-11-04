#!/bin/sh
# Helm post-renderer of release `substrate` (../helmfile.yaml): reads the
# rendered manifests on stdin and writes them to stdout, with tracing added to
# the egress proxy's configuration.
#
# WHY. Substrate's chart gives its router a tracing block and its egress proxy
# none (checked up to 1.0.0-rc1). A span of a call an agent makes through
# this proxy arrives pointing at a parent nothing recorded. Measured on
# 2026-10-30 on Substrate 0.3.0-alpha3, with no export from the router either:
# 39 spans in 13 disconnected pieces, 11 of the breaks on calls out of the
# sandbox, which only this proxy sits on. With this file and the router's
# export, on 0.6.0-alpha3 and on 1.0.0-rc1: 1 piece (docs/measurements.md).
#
# No randomSampling: only a request that already carries a trace is traced, so
# an agent's own telemetry going out through this proxy starts no trace.
#
# Fails if the chart no longer has the block this hangs on, rather than
# dropping the export without a word. To remove all of this, delete this file
# and the `postRenderer` line.
set -o errexit
set -o nounset

awk '
  /^---/ { in_config = 0 }
  /^  name: atenet-egress-agentgateway-config$/ { in_config = 1 }
  { print }
  in_config && !done && /^    frontendPolicies:$/ {
    print "      tracing:"
    print "        host: otel-collector.telemetry.svc.cluster.local:4317"
    print "        protocol: grpc"
    print "        resources:"
    print "          service.name: \047\"atenet-egress\"\047"
    done = 1
  }
  END {
    if (!done) {
      print "egress-tracing: no frontendPolicies in ConfigMap atenet-egress-agentgateway-config" > "/dev/stderr"
      exit 1
    }
  }
'

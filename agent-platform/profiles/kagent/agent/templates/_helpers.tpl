{{- define "kagent-agent.labels" -}}
app.kubernetes.io/name: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: kagent-agents
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- /*
The tool servers that are switched on, as a JSON list in name order, each with
its key as `name`. `tools` is a map so that a component can say which tools it
uses and a cluster can say where the server is, in two values files.
*/ -}}
{{- define "kagent-agent.tools" -}}
{{- $on := list -}}
{{- range $name := keys .Values.tools | sortAlpha -}}
{{- $tool := index $.Values.tools $name -}}
{{- if $tool.enabled -}}
{{- $on = append $on (merge (dict "name" $name) $tool) -}}
{{- end -}}
{{- end -}}
{{- toJson $on -}}
{{- end -}}

{{- define "kagent-agent.a2aPath" -}}
{{- .Values.a2a.pathPrefix | default (printf "/a2a/%s" .Release.Name) -}}
{{- end -}}

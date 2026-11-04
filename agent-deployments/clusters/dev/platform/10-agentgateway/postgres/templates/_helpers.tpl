{{/* Selector labels too, so they stay fixed for the life of the release. */}}
{{- define "agentgateway-postgresql.labels" -}}
app.kubernetes.io/name: agentgateway-postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: database
{{- end -}}

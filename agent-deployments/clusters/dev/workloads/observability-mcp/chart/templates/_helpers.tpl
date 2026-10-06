{{/* The name of every object: the release name. */}}
{{- define "observability-mcp.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "observability-mcp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "observability-mcp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "observability-mcp.labels" -}}
{{ include "observability-mcp.selectorLabels" . }}
app.kubernetes.io/version: {{ required "image.tag is required" .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

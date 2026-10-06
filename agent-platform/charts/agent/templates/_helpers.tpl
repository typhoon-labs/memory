{{/* The name of every object: the release name. */}}
{{- define "agent.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Labels that select the workload's pods. */}}
{{- define "agent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Labels on every object. */}}
{{- define "agent.labels" -}}
{{ include "agent.selectorLabels" . }}
app.kubernetes.io/version: {{ required "image.tag is required" .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* The ServiceAccount the pod runs as. */}}
{{- define "agent.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "agent.name" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

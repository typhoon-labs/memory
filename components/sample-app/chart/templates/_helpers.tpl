{{/*
Every template below takes a dict: root (the chart context), name (the
service's name, used for the Deployment, the Service and the container) and
cfg (that service's block in values.yaml).
*/}}

{{- define "sample-app.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end }}

{{/* Pod labels. The version label follows the image tag, so it changes with a rollback. */}}
{{- define "sample-app.podLabels" -}}
{{ include "sample-app.selectorLabels" . }}
app.kubernetes.io/part-of: sample-app
app.kubernetes.io/version: {{ .cfg.image.tag | toString | quote }}
{{- with .cfg.team }}
team: {{ . | quote }}
{{- end }}
{{- end }}

{{- define "sample-app.labels" -}}
{{ include "sample-app.podLabels" . }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end }}

{{/*
Service labels: the same without the version. A Service fronts whichever
version runs. A label that followed the image tag would make every version
change rewrite the Service too, and the change must touch one object, the
Deployment: that is all delivery-mcp's Role lets its `helm upgrade` patch.
*/}}
{{- define "sample-app.serviceLabels" -}}
{{ include "sample-app.selectorLabels" . }}
app.kubernetes.io/part-of: sample-app
{{- with .cfg.team }}
team: {{ . | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end }}

{{- define "sample-app.image" -}}
{{- $registry := .root.Values.imageRegistry | default "" | trimSuffix "/" -}}
{{- if $registry }}{{ $registry }}/{{ end }}{{ .cfg.image.repository }}:{{ .cfg.image.tag | toString }}
{{- end }}

{{/* One service: its Deployment and its Service. `env` is an optional list of extra variables. */}}
{{- define "sample-app.workload" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
  namespace: {{ .root.Release.Namespace }}
  labels:
    {{- include "sample-app.labels" . | nindent 4 }}
spec:
  replicas: {{ .cfg.replicas }}
  revisionHistoryLimit: 3
  # A new pod must be ready before an old one goes, so changing a version
  # never leaves the service without a pod.
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      {{- include "sample-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "sample-app.podLabels" . | nindent 8 }}
      {{- with .root.Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 15
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: {{ .name }}
          image: {{ include "sample-app.image" . | quote }}
          imagePullPolicy: {{ .root.Values.imagePullPolicy }}
          ports:
            - name: http
              containerPort: 8080
          env:
            - name: DEPLOYMENT_ENVIRONMENT
              value: {{ .root.Values.environment | quote }}
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: OTEL_RESOURCE_ATTRIBUTES
              value: k8s.namespace.name=$(POD_NAMESPACE),k8s.pod.name=$(POD_NAME),k8s.deployment.name={{ .name }}
            {{- with .root.Values.otlp.endpoint }}
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: {{ . | quote }}
            {{- end }}
            {{- with .env }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
          # /healthz says the process is up. It does not run a search, so
          # search-service 2.1.0 becomes ready and takes traffic: that is the
          # incident. A probe that searched would keep 2.1.0 out of service.
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 1
            failureThreshold: 30
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 2
            timeoutSeconds: 2
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
            timeoutSeconds: 2
          lifecycle:
            # Time for the Service to stop sending requests here before the
            # process is told to stop.
            preStop:
              exec:
                command: ["sleep", "3"]
          resources:
            {{- toYaml .root.Values.resources | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
---
apiVersion: v1
kind: Service
metadata:
  name: {{ .name }}
  namespace: {{ .root.Release.Namespace }}
  labels:
    {{- include "sample-app.serviceLabels" . | nindent 4 }}
spec:
  type: {{ .cfg.service.type }}
  selector:
    {{- include "sample-app.selectorLabels" . | nindent 4 }}
  ports:
    - name: http
      port: 8080
      targetPort: http
      {{- if and (eq .cfg.service.type "NodePort") .cfg.service.nodePort }}
      nodePort: {{ .cfg.service.nodePort }}
      {{- end }}
{{- end }}

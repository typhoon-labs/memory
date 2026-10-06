{{/*
CEL: the request comes from one of the platform's deployers.
*/}}
{{- define "gateway-rules.deployer" -}}
{{- $d := .Values.platform.deployers -}}
{{- if not (or $d.groups $d.usernames) -}}
{{- fail "platform.deployers: name at least one group or user that applies the platform's releases" -}}
{{- end -}}
(request.userInfo.username in {{ toJson ($d.usernames | default list) }} || request.userInfo.groups.exists(g, g in {{ toJson ($d.groups | default list) }}))
{{- end -}}

{{/*
CEL: the resource in the named variable was applied as part of a Helm release.
Call with the variable's name, such as "object".
*/}}
{{- define "gateway-rules.released" -}}
({{ . }}.metadata.?labels[?"app.kubernetes.io/managed-by"].orValue("") == "Helm" && {{ . }}.metadata.?annotations[?"meta.helm.sh/release-name"].orValue("") != "")
{{- end -}}

{{/*
The match condition shared by the three policies that check content: every
request except a deployer applying a release.
*/}}
{{- define "gateway-rules.notAPlatformRelease" -}}
- name: not-a-platform-release
  expression: >-
    !({{ include "gateway-rules.deployer" . }} && {{ include "gateway-rules.released" "object" }})
{{- end -}}

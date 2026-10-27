{{/* The name of every object: the release name. */}}
{{- define "chain-sts.name" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Labels that select the service's pods. */}}
{{- define "chain-sts.selectorLabels" -}}
app.kubernetes.io/name: {{ include "chain-sts.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Labels on every object. */}}
{{- define "chain-sts.labels" -}}
{{ include "chain-sts.selectorLabels" . }}
app.kubernetes.io/version: {{ required "image.tag is required" .Values.image.tag | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* The Service's own address: the default issuer and public URL. */}}
{{- define "chain-sts.serviceUrl" -}}
{{- $url := printf "http://%s.%s.svc.cluster.local" (include "chain-sts.name" .) .Release.Namespace -}}
{{- if ne (int .Values.service.port) 80 -}}
{{- $url = printf "%s:%d" $url (int .Values.service.port) -}}
{{- end -}}
{{- $url -}}
{{- end -}}

{{/* Where the files are mounted in the container. */}}
{{- define "chain-sts.configDir" -}}/etc/chain-sts/config{{- end -}}
{{- define "chain-sts.keyDir" -}}/etc/chain-sts/signing-key{{- end -}}
{{- define "chain-sts.nextKeyDir" -}}/etc/chain-sts/next-key{{- end -}}
{{- define "chain-sts.previousKeyDir" -}}/etc/chain-sts/previous-key{{- end -}}
{{- define "chain-sts.podDir" -}}/var/run/secrets/kubernetes.io/serviceaccount{{- end -}}

{{/* The service's configuration file. */}}
{{- define "chain-sts.config" -}}
{{- range $key := list "issuer" "public_url" "signing_key_file" "signing_keys" "subject_issuers" "actor" }}
{{- if hasKey $.Values.policy $key }}
{{- fail (printf "policy.%s: the chart sets this key; set the chart's own value instead" $key) }}
{{- end }}
{{- end }}
{{- $issuer := default (include "chain-sts.serviceUrl" .) .Values.issuer -}}
{{- /* The pod's own token and the cluster's CA: the bearer and the trust
       anchor of every call to the API server, whichever the check. */ -}}
{{- $podToken := printf "%s/token" (include "chain-sts.podDir" .) -}}
{{- $podCa := printf "%s/ca.crt" (include "chain-sts.podDir" .) -}}
{{- $actor := dict "verify_with" .Values.actor.verifyWith "audiences" .Values.actor.audiences -}}
{{- if eq .Values.actor.verifyWith "token_review" -}}
{{- /* The API server's address: KUBERNETES_SERVICE_HOST and _PORT, which
       Kubernetes sets in the pod. */ -}}
{{- $_ := set $actor "token_review" (dict "token_file" $podToken "ca_file" $podCa) -}}
{{- else if eq .Values.actor.verifyWith "jwks" -}}
{{- $_ := set $actor "jwks" (dict
  "issuer" (required "actor.serviceAccountIssuer is required" .Values.actor.serviceAccountIssuer)
  "jwks_url" (required "actor.jwksUrl is required" .Values.actor.jwksUrl)
  "token_file" $podToken
  "ca_file" $podCa) -}}
{{- else -}}
{{- fail (printf "actor.verifyWith is %q; it is token_review or jwks" (toString .Values.actor.verifyWith)) -}}
{{- end -}}
{{- $config := dict
  "issuer" $issuer
  "public_url" (default $issuer .Values.publicUrl)
  "signing_key_file" (printf "%s/%s" (include "chain-sts.keyDir" .) .Values.signingKey.key)
  "subject_issuers" (list (dict
    "issuer" (required "identity.issuer is required" .Values.identity.issuer)
    "jwks_url" (required "identity.jwksUrl is required" .Values.identity.jwksUrl)
    "audience" (required "identity.audience is required" .Values.identity.audience)))
  "actor" $actor
-}}
{{- /* During a rotation, every key by the name of its Secret, and its role. */ -}}
{{- $sk := .Values.signingKey -}}
{{- if or $sk.next $sk.previous -}}
{{- $named := compact (list $sk.secretName $sk.next $sk.previous) -}}
{{- if ne (len $named) (len (uniq $named)) -}}
{{- fail "signingKey: secretName, next and previous must name different Secrets" -}}
{{- end -}}
{{- $files := dict $sk.secretName (get $config "signing_key_file") -}}
{{- $keys := dict "files" $files "sign" $sk.secretName -}}
{{- range $role := list "next" "previous" -}}
{{- with index $sk $role -}}
{{- $_ := set $files . (printf "%s/%s" (include (printf "chain-sts.%sKeyDir" $role) $) $sk.key) -}}
{{- $_ := set $keys $role . -}}
{{- end -}}
{{- end -}}
{{- $_ := unset $config "signing_key_file" -}}
{{- $_ := set $config "signing_keys" $keys -}}
{{- end -}}
{{- toYaml (merge $config (deepCopy .Values.policy)) -}}
{{- end -}}

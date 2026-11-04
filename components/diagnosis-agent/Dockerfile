# diagnosis-agent's skills, as an image that holds files and runs nothing.
#
# kagent mounts it read-only into the agent's sandbox (AgentTemplate
# spec.skills, source `oci`, pinned by digest), and kagent's runtime copies the
# skill directory that `path` names into its skills directory. So the layout
# is the Agent Skills one, from the root: /<skill name>/SKILL.md.
FROM scratch
ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="diagnosis-agent-skills" \
      org.opencontainers.image.version="${VERSION}"
COPY skills/ /

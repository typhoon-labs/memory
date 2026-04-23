#!/bin/sh

# Install lefthook git hooks for local development only.
# Skipped inside Docker builds where .git is excluded via .dockerignore,
# and in CI environments where git hooks are not needed.
[ -d .git ] && lefthook install || true

#!/bin/sh

# Remove build artifacts, caches, and installed dependencies.
# Useful for a fresh start when switching branches or debugging
# dependency resolution issues.

rm -rf \
  node_modules \
  .turbo \
  coverage \
  packages/*/dist \
  packages/*/.turbo \
  apps/*/dist \
  apps/*/.turbo

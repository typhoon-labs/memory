#!/usr/bin/env bash
set -euo pipefail

# ─── Rename URSA → Typhoon (case-preserving) ───────────────────────────
# Replaces all occurrences in file contents and filenames.
# Skips node_modules, .git, dist, .turbo, .mastra, .playwright-mcp directories.
# Also removes any CLAUDE.md files and the conductor/ directory.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXCLUDE_DIRS="node_modules|\.git|dist|\.turbo|\.mastra|\.playwright-mcp"

echo "=== Phase 1: Remove CLAUDE.md files (outside node_modules) and conductor/ ==="
find . -name 'CLAUDE.md' -not -path '*/node_modules/*' -not -path '*/.git/*' | while IFS= read -r f; do
  echo "  Removing: $f"
  rm "$f"
done

if [ -d "conductor" ]; then
  echo "  Removing: conductor/"
  rm -rf conductor
fi

echo ""
echo "=== Phase 2: Replace file contents (case-preserving) ==="
# Find all text files, skip excluded dirs
grep -rlI --include='*' -E '[Uu][Rr][Ss][Aa]' . \
  | grep -Ev "(${EXCLUDE_DIRS})" \
  | while IFS= read -r file; do
    # Three passes: URSA→TYPHOON, URSA→Typhoon, ursa→typhoon
    sed -i \
      -e 's/URSA/TYPHOON/g' \
      -e 's/Ursa/Typhoon/g' \
      -e 's/ursa/typhoon/g' \
      "$file"
    echo "  Updated: $file"
  done

echo ""
echo "=== Phase 3: Rename files and directories containing 'ursa' (case-insensitive) ==="
# Rename files first (deepest paths first to avoid broken paths)
find . -iname '*ursa*' -not -path '*/node_modules/*' -not -path '*/.git/*' \
  | sort -r \
  | while IFS= read -r path; do
    dir="$(dirname "$path")"
    base="$(basename "$path")"
    newbase="$(echo "$base" | sed -e 's/URSA/TYPHOON/g' -e 's/Ursa/Typhoon/g' -e 's/ursa/typhoon/g')"
    if [ "$base" != "$newbase" ]; then
      echo "  Rename: $path → $dir/$newbase"
      mv "$path" "$dir/$newbase"
    fi
  done

echo ""
echo "=== Phase 4: Verify — case-insensitive search for remaining 'ursa' ==="
echo ""
REMAINING=$(grep -rlI --include='*' -iE 'ursa' . \
  | grep -Ev "(${EXCLUDE_DIRS})" || true)

if [ -z "$REMAINING" ]; then
  echo "  No remaining references to 'ursa' found. All clean!"
else
  echo "  WARNING: The following files still contain 'ursa':"
  echo "$REMAINING" | while IFS= read -r f; do
    echo "    $f"
    grep -inH 'ursa' "$f" | head -5 | sed 's/^/      /'
  done
fi

# Also check for filenames
REMAINING_NAMES=$(find . -iname '*ursa*' \
  -not -path '*/node_modules/*' -not -path '*/.git/*' || true)

if [ -n "$REMAINING_NAMES" ]; then
  echo ""
  echo "  WARNING: Files/dirs still named with 'ursa':"
  echo "$REMAINING_NAMES" | sed 's/^/    /'
fi

echo ""
echo "Done."

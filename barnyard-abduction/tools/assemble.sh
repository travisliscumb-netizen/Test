#!/bin/sh
# Assemble the single-file build from the ordered parts in build/.
# D-001: the deliverable is ONE evolving HTML file. These parts exist only so
# the file can be edited and syntax-checked section by section; they are not a
# module system and there is no runtime import step.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$DIR/barnyard-abduction.html"

cat \
  "$DIR/build/part_00_head.html" \
  "$DIR/build/part_01_core.js" \
  "$DIR/build/part_02_map.js" \
  "$DIR/build/part_03_world.js" \
  "$DIR/build/part_04_creatures.js" \
  "$DIR/build/part_05_ufo.js" \
  "$DIR/build/part_06_systems.js" \
  "$DIR/build/part_07_game.js" \
  "$DIR/build/part_08_ui.js" \
  "$DIR/build/part_99_tail.html" \
  > "$OUT"

echo "assembled -> $OUT ($(wc -c < "$OUT") bytes)"

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 /absolute/path/to/image /absolute/path/to/project" >&2
  exit 2
fi

source_image="$1"
project_dir="$2"

if [[ ! -f "$source_image" ]]; then
  echo "Image not found: $source_image" >&2
  exit 1
fi

if [[ ! -f "$project_dir/index.html" || ! -d "$project_dir/public" ]]; then
  echo "Target is not a sticker-peel project: $project_dir" >&2
  exit 1
fi

extension="${source_image##*.}"
extension="$(printf '%s' "$extension" | tr '[:upper:]' '[:lower:]')"
case "$extension" in
  png|webp|jpg|jpeg|avif) ;;
  *)
    echo "Unsupported image type .$extension (use PNG, WebP, JPG, JPEG, or AVIF)" >&2
    exit 1
    ;;
esac

target_name="hero-image.$extension"
cp "$source_image" "$project_dir/public/$target_name"

node - "$project_dir/index.html" "$target_name" <<'NODE'
import fs from 'node:fs';

const [htmlPath, targetName] = process.argv.slice(2);
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/src="\/(?:hero-image|portrait-cutout)\.(?:png|webp|jpe?g|avif)"/, `src="/${targetName}"`);
fs.writeFileSync(htmlPath, html);
NODE

echo "Installed $source_image as public/$target_name"

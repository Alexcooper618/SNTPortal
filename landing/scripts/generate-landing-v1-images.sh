#!/usr/bin/env bash
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE_GEN="${CODEX_HOME:-$HOME/.codex}/skills/imagegen/scripts/image_gen.py"
OUT_DIR="$ROOT_DIR/output/imagegen/landing-v1"
PUBLIC_DIR="$ROOT_DIR/landing/public/images/landing"
DRY_RUN_ARGS=()

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN_ARGS=(--dry-run)
fi

if [[ ${#DRY_RUN_ARGS[@]} -eq 0 && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set. Export it and re-run this script." >&2
  exit 1
fi

if [[ ! -f "$IMAGE_GEN" ]]; then
  echo "imagegen CLI not found at: $IMAGE_GEN" >&2
  exit 1
fi

mkdir -p "$OUT_DIR" "$PUBLIC_DIR"

python3 "$IMAGE_GEN" generate \
  --model gpt-image-1.5 \
  --prompt "абстрактная цифровая среда управления с мягкими стеклянными слоями и тонкими потоками данных" \
  --use-case "stylized-concept" \
  --scene "абстрактный технологичный фон без конкретных предметов" \
  --style "минималистичный abstract render" \
  --composition "широкая сцена, фокус в правой половине, чистая левая часть под текст" \
  --palette "холодные нейтрали с сдержанным синим акцентом" \
  --constraints "без текста, без логотипов, без watermark, без фотореалистичных людей" \
  --negative "визуальный шум, перенасыщенность, кислотные цвета" \
  --size 1536x1024 \
  --quality medium \
  --output-format webp \
  --out "$OUT_DIR/hero-abstract-v1.webp" \
  --force \
  "${DRY_RUN_ARGS[@]}"

python3 "$IMAGE_GEN" generate \
  --model gpt-image-1.5 \
  --prompt "две взаимосвязанные абстрактные формы как метафора председателя и жителей" \
  --use-case "stylized-concept" \
  --scene "мягкий светлый фон" \
  --style "минималистичная абстракция" \
  --composition "центрированная композиция, открытые края для контента" \
  --palette "светло-серый, голубой, сдержанный синий" \
  --constraints "без текста, без логотипов, без watermark" \
  --negative "перегруженность, грубые формы" \
  --size 1536x1024 \
  --quality medium \
  --output-format webp \
  --out "$OUT_DIR/audience-abstract-v1.webp" \
  --force \
  "${DRY_RUN_ARGS[@]}"

python3 "$IMAGE_GEN" generate \
  --model gpt-image-1.5 \
  --prompt "абстрактная модульная сетка и связи как метафора функций платформы" \
  --use-case "stylized-concept" \
  --scene "чистый фон с мягкой глубиной" \
  --style "минималистичная геометрическая абстракция" \
  --composition "горизонтальный ритм, читаемость на desktop и mobile" \
  --palette "холодные нейтрали и синий акцент" \
  --constraints "без текста, без логотипов, без watermark" \
  --negative "хаотичные контрастные элементы" \
  --size 1536x1024 \
  --quality medium \
  --output-format webp \
  --out "$OUT_DIR/features-abstract-v1.webp" \
  --force \
  "${DRY_RUN_ARGS[@]}"

python3 "$IMAGE_GEN" generate \
  --model gpt-image-1.5 \
  --prompt "спокойные волны и полупрозрачные защитные формы как метафора прозрачности и единого контура" \
  --use-case "stylized-concept" \
  --scene "светлый абстрактный фон" \
  --style "минималистичный soft abstract" \
  --composition "мягкая глубина, низкий контраст" \
  --palette "прохладные мягкие оттенки" \
  --constraints "без текста, без логотипов, без watermark" \
  --negative "агрессивные текстуры, высокая контрастность" \
  --size 1536x1024 \
  --quality medium \
  --output-format webp \
  --out "$OUT_DIR/benefits-abstract-v1.webp" \
  --force \
  "${DRY_RUN_ARGS[@]}"

python3 "$IMAGE_GEN" generate \
  --model gpt-image-1.5 \
  --prompt "чистая брендовая абстракция для social preview в стилистике лендинга" \
  --use-case "stylized-concept" \
  --scene "светлый минималистичный фон" \
  --style "premium abstract render" \
  --composition "центрированный фокус, безопасные поля для автокропа соцсетей" \
  --palette "холодные нейтрали и мягкий синий акцент" \
  --constraints "без текста, без логотипов, без watermark" \
  --negative "клипарт, шум, чрезмерный контраст" \
  --size 1536x1024 \
  --quality high \
  --output-format png \
  --out "$OUT_DIR/og-abstract-v1.png" \
  --force \
  "${DRY_RUN_ARGS[@]}"

if [[ ${#DRY_RUN_ARGS[@]} -gt 0 ]]; then
  echo "Dry-run complete. No files were generated."
  exit 0
fi

cp "$OUT_DIR/hero-abstract-v1.webp" "$PUBLIC_DIR/hero-abstract-v1.webp"
cp "$OUT_DIR/audience-abstract-v1.webp" "$PUBLIC_DIR/audience-abstract-v1.webp"
cp "$OUT_DIR/features-abstract-v1.webp" "$PUBLIC_DIR/features-abstract-v1.webp"
cp "$OUT_DIR/benefits-abstract-v1.webp" "$PUBLIC_DIR/benefits-abstract-v1.webp"
cp "$OUT_DIR/og-abstract-v1.png" "$PUBLIC_DIR/og-abstract-v1.png"

echo "Generated and synced landing assets to $PUBLIC_DIR"





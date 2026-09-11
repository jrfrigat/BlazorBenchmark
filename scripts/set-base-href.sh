#!/bin/sh
# Переписывает базовый путь опубликованного Blazor WASM-приложения.
# Нужен, когда приложение живёт не в корне сайта, а в подкаталоге (/flare/, /mudblazor/, /radzen/):
# так его раздаёт и GitHub Pages, и образ Docker. Переписать надо оба места — index.html и
# service-worker.js: если base сервис-воркера останется "/", он закэширует ресурсы чужого пути
# и приложение после перезагрузки покажет белый экран.
# Заодно кладём копию index.html в 404.html — для статических хостингов, которые ищут 404.html
# рядом со страницей. GitHub Pages смотрит ТОЛЬКО корневой 404.html (landing/404.html), он и
# разбирает прямые ссылки вида /flare/orders.
#
# Использование: set-base-href.sh <каталог wwwroot> <базовый путь со слешами по краям>
set -eu

dir="$1"
base="$2"

sed -i "s|<base href=\"[^\"]*\"|<base href=\"$base\"|" "$dir/index.html"

if [ -f "$dir/service-worker.js" ]; then
    sed -i "s|const base = \"[^\"]*\";|const base = \"$base\";|" "$dir/service-worker.js"
fi

cp "$dir/index.html" "$dir/404.html"

echo "base href = $base  ->  $dir"

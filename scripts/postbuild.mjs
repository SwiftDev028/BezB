// GitHub Pages не умеет SPA-маршрутизацию: для неизвестных путей он отдаёт 404.html.
// Копируем собранный index.html в 404.html — тогда прямые ссылки и F5 на вложенных URL работают.
import { copyFileSync, writeFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/.nojekyll', '')
console.log('postbuild: dist/404.html и dist/.nojekyll созданы')

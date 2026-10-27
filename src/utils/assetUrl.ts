/** Путь к файлу из `public/` с учётом `base` Vite (GitHub Pages живёт в подкаталоге). */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}

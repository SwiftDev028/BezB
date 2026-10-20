import { useEffect } from 'react'

const BASE_TITLE = 'BezB — Digital. Without Limits.'

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — BezB` : BASE_TITLE
  }, [title])
}

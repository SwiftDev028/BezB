import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

export interface InfoSection {
  heading: string
  paragraphs: string[]
}

interface InfoPageProps {
  title: string
  intro: string
  sections: InfoSection[]
  /** Показать предупреждение, что текст — черновик и требует заполнения */
  draft?: boolean
  children?: ReactNode
}

export function InfoPage({ title, intro, sections, draft = false, children }: InfoPageProps) {
  useDocumentTitle(title)
  return (
    <div className="container-x py-8 sm:py-12">
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-6xl">{title}</h1>
        <p className="mt-4 text-lg text-silver">{intro}</p>

        {draft && (
          <p className="mt-6 border-l-4 border-red bg-coal p-4 text-sm text-silver">
            Черновик для прототипа. Места, отмеченные «[Требует заполнения]», нужно заполнить и согласовать
            (при необходимости — с юристом) до запуска продаж.
          </p>
        )}

        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="mb-3 text-2xl sm:text-3xl">{s.heading}</h2>
              <div className="space-y-3 text-silver">
                {s.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        {children}
      </div>
    </div>
  )
}

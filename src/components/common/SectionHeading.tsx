import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

interface SectionHeadingProps {
  title: string
  eyebrow?: string
  linkTo?: string
  linkLabel?: string
  children?: ReactNode
}

export function SectionHeading({ title, eyebrow, linkTo, linkLabel = 'Смотреть все', children }: SectionHeadingProps) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
      <div>
        {eyebrow && (
          <p className="mb-1 font-display text-sm uppercase tracking-[0.2em] text-red">{eyebrow}</p>
        )}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl">{title}</h2>
        {children}
      </div>
      {linkTo && (
        <Link
          to={linkTo}
          className="inline-flex shrink-0 items-center gap-1 py-2 text-sm font-semibold text-silver transition-colors hover:text-white"
        >
          {linkLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

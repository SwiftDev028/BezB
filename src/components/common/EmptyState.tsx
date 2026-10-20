import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  text?: string
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, text, children }: EmptyStateProps) {
  return (
    <div className="texture-hatch border border-dashed border-line bg-coal px-6 py-14 text-center">
      <Icon className="mx-auto mb-4 size-10 text-red" strokeWidth={1.5} aria-hidden="true" />
      <h2 className="text-xl sm:text-2xl">{title}</h2>
      {text && <p className="mx-auto mt-2 max-w-md text-silver">{text}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  )
}

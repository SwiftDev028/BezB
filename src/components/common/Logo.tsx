import { Link } from 'react-router-dom'

interface LogoProps {
  size?: 'md' | 'lg'
  className?: string
}

/** Логотип: плотное начертание BEZB, красный замыкающий знак и «разрез» — читается и в 24px. */
export function Logo({ size = 'md', className = '' }: LogoProps) {
  const text = size === 'lg' ? 'text-5xl' : 'text-3xl sm:text-4xl'
  return (
    <Link
      to="/"
      aria-label="BezB — на главную"
      className={`group inline-flex min-h-11 items-center gap-2 ${className}`}
    >
      <span
        className={`font-display ${text} font-bold uppercase leading-none tracking-tight text-white`}
        style={{ fontStretch: 'condensed' }}
      >
        Bez<span className="text-red">B</span>
      </span>
      <span
        aria-hidden="true"
        className="h-6 w-1.5 sm:h-8 sm:w-2 -skew-x-[20deg] bg-red transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { banners } from '../../data/banners'
import { btnPrimary } from '../common/ui'

const AUTOPLAY_MS = 6500

export function BannerSlider() {
  const reduceMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [userStopped, setUserStopped] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = banners.length

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count])

  // Автосмена: не работает при наведении/фокусе, остановке пользователем и prefers-reduced-motion
  const autoplay = !paused && !userStopped && !reduceMotion
  useEffect(() => {
    if (!autoplay) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [autoplay, count, index])

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Рекламные баннеры"
      className="relative border-b border-line bg-coal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1))
      }}
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live={autoplay ? 'off' : 'polite'}
        >
          {banners.map((b, i) => (
            <div
              key={b.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} из ${count}`}
              aria-hidden={i !== index}
              inert={i !== index}
              className="texture-hatch relative min-h-[26rem] w-full shrink-0 overflow-hidden sm:min-h-[28rem] lg:min-h-[32rem]"
              style={{ background: `linear-gradient(105deg, #0b0b0c 45%, ${b.accent}33 100%)` }}
            >
              <div
                aria-hidden="true"
                className="absolute -right-16 top-0 hidden h-full w-1/3 -skew-x-[18deg] opacity-80 md:block"
                style={{ background: `linear-gradient(180deg, ${b.accent}, transparent)`, opacity: 0.35 }}
              />
              <div
                aria-hidden="true"
                className="absolute right-6 top-1/2 hidden -translate-y-1/2 select-none font-display text-[16rem] font-bold uppercase leading-none text-white/[0.04] lg:block"
              >
                {b.eyebrow.slice(0, 2)}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: b.accent }} aria-hidden="true" />

              <div className="container-x relative flex h-full min-h-[inherit] items-center py-12 pb-20">
                <div className="max-w-2xl">
                  <p className="mb-3 font-display text-base uppercase tracking-[0.25em]" style={{ color: b.accent }}>
                    {b.eyebrow}
                  </p>
                  <h2 className="text-4xl leading-[1.12] sm:text-5xl lg:text-7xl">{b.title}</h2>
                  <p className="mt-4 max-w-xl text-base text-silver sm:text-lg">{b.text}</p>
                  <Link to={b.to} className={`${btnPrimary} mt-7`}>
                    {b.cta}
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container-x pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-between">
        <div className="pointer-events-auto flex items-center gap-1" role="group" aria-label="Выбор слайда">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Слайд ${i + 1}: ${b.eyebrow}`}
              aria-current={i === index}
              className="grid h-11 w-8 place-items-center"
            >
              <span className={`block h-1.5 transition-all ${i === index ? 'w-8 bg-red' : 'w-4 bg-white/40 hover:bg-white/70'}`} />
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          {!reduceMotion && (
            <button
              type="button"
              onClick={() => setUserStopped((v) => !v)}
              aria-label={userStopped ? 'Включить автосмену слайдов' : 'Остановить автосмену слайдов'}
              className="grid size-11 place-items-center bg-ink/80 hover:bg-steel"
            >
              {userStopped ? <Play className="size-5" aria-hidden="true" /> : <Pause className="size-5" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Предыдущий слайд"
            className="grid size-11 place-items-center bg-ink/80 hover:bg-steel"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Следующий слайд"
            className="grid size-11 place-items-center bg-ink/80 hover:bg-steel"
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

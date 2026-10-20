import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { FaqItem } from '../../types'

export function Accordion({ items }: { items: FaqItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => {
        const open = openId === item.id
        return (
          <div key={item.id}>
            <h3 className="font-sans text-base normal-case tracking-normal">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`faq-${item.id}`}
                onClick={() => setOpenId(open ? null : item.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left font-semibold text-white transition-colors hover:text-red-hot"
              >
                {item.question}
                <Plus
                  aria-hidden="true"
                  className={`size-5 shrink-0 text-red transition-transform ${open ? 'rotate-45' : ''}`}
                />
              </button>
            </h3>
            <div id={`faq-${item.id}`} role="region" hidden={!open} className="pb-4 pr-9 text-silver">
              {item.answer}
            </div>
          </div>
        )
      })}
    </div>
  )
}

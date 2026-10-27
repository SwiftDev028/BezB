import type { ReactNode } from 'react'

type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'warning'; text: string }

const trustedLinks = new Map([
  ['https://www.rockstargames.com/legal', 'https://www.rockstargames.com/legal'],
  ['https://www.rockstargames.com/privacy', 'https://www.rockstargames.com/privacy'],
])

function parseBlocks(source: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^#{2,3}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: heading[1] })
      continue
    }

    const warning = line.match(/^>\s*(?:⚠️\s*)?(.+)$/)
    if (warning) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'warning', text: warning[1] })
      continue
    }

    const item = line.match(/^(?:[-*]\s+|\d+\.\s+)(.+)$/)
    if (item) {
      flushParagraph()
      list.push(item[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}

function formatInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/www\.rockstargames\.com\/(?:legal|privacy)\))/g)
  return tokens.map((token, index) => {
    const bold = token.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={index} className="font-semibold text-white">{bold[1]}</strong>

    const link = token.match(/^\[([^\]]+)\]\((https:\/\/www\.rockstargames\.com\/(?:legal|privacy))\)$/)
    const href = link ? trustedLinks.get(link[2]) : undefined
    if (link && href) {
      return <a key={index} href={href} target="_blank" rel="noreferrer" className="break-all text-white underline underline-offset-2">{link[1]}</a>
    }

    return token
  })
}

export function productDescriptionPreview(source: string, maxLength = 180): string {
  const text = source
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*(?:⚠️\s*)?/gm, '')
    .replace(/^(?:[-*]\s+|\d+\.\s+)/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(https:\/\/www\.rockstargames\.com\/(?:legal|privacy)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

export function ProductDescription({ description }: { description: string }) {
  const blocks = parseBlocks(description)

  return (
    <div className="min-w-0 space-y-5 break-words text-silver [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h2 key={index} className="font-display text-xl uppercase leading-tight tracking-wide text-white sm:text-2xl">{formatInline(block.text)}</h2>
        }
        if (block.type === 'warning') {
          return <p key={index} role="note" className="border-l-4 border-red bg-coal px-4 py-3 text-sm leading-relaxed text-white sm:text-base">{formatInline(block.text)}</p>
        }
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{formatInline(item)}</li>)}
            </ul>
          )
        }
        return <p key={index} className="text-sm leading-relaxed sm:text-base">{formatInline(block.text)}</p>
      })}
    </div>
  )
}

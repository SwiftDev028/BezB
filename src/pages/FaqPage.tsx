import { Accordion } from '../components/common/Accordion'
import { faq } from '../data/faq'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function FaqPage() {
  useDocumentTitle('Вопросы и ответы')
  return (
    <div className="container-x py-8 sm:py-12">
      <div className="max-w-3xl">
        <h1 className="mb-6 text-4xl sm:text-6xl">Вопросы и ответы</h1>
        <Accordion items={faq} />
      </div>
    </div>
  )
}

import { InfoPage } from '../components/common/InfoPage'

export default function RefundPolicyPage() {
  return (
    <InfoPage
      title="Правила возврата"
      intro="Условия возврата цифровых товаров будут опубликованы до запуска продаж."
      sections={[
        {
          heading: 'Сейчас',
          paragraphs: ['Оплата не принимается, поэтому возвраты не требуются.'],
        },
        {
          heading: 'Условия возврата',
          paragraphs: [
            'Порядок, сроки и случаи возврата с учётом особенностей цифровых товаров и применимого законодательства: [Требует заполнения]',
          ],
        },
      ]}
      draft
    />
  )
}

import { InfoPage } from '../components/common/InfoPage'

export default function TermsPage() {
  return (
    <InfoPage
      title="Условия использования"
      intro="Правила пользования сайтом и покупки товаров будут опубликованы до запуска продаж."
      sections={[
        {
          heading: 'Демонстрационный режим',
          paragraphs: [
            'Информация на сайте носит демонстрационный характер и не является публичной офертой.',
          ],
        },
        {
          heading: 'Товарные знаки',
          paragraphs: [
            'Названия Apple, Xbox, PlayStation, Steam, ChatGPT, Claude и других сервисов принадлежат их владельцам. BezB не является их официальным представителем.',
          ],
        },
        {
          heading: 'Полный текст условий',
          paragraphs: ['[Требует заполнения]'],
        },
      ]}
      draft
    />
  )
}

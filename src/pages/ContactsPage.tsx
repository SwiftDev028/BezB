import { InfoPage } from '../components/common/InfoPage'

export default function ContactsPage() {
  return (
    <InfoPage
      title="Контакты"
      intro="Поддержка и связь с магазином."
      sections={[
        {
          heading: 'Как связаться',
          paragraphs: [
            'Email поддержки: [Требует заполнения]',
            'Мессенджер или Telegram: [Требует заполнения]',
            'Время работы поддержки: [Требует заполнения]',
          ],
        },
      ]}
      draft
    />
  )
}

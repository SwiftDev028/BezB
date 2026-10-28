import { Link } from 'react-router-dom'
import { btnSecondary } from '../components/common/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function RefundPolicyPage() {
  useDocumentTitle('Правила возврата и отмены заказа')

  return (
    <article className="container-x py-8 sm:py-12">
      <div className="max-w-3xl">
        <h1 className="text-3xl sm:text-6xl">Правила возврата и отмены заказа</h1>
        <p className="mt-4 text-sm text-silver">
          Дата вступления в силу: <time dateTime="2026-10-28">28.10.2026</time>
        </p>

        <p role="status" className="mt-6 border-l-4 border-red bg-coal p-4 text-sm leading-relaxed text-silver">
          Страница подготовлена локально и ещё не опубликована. Контакт поддержки не подтверждён: перед публикацией
          необходимо указать действующий публичный адрес электронной почты.
        </p>

        <div className="mt-8 space-y-8 text-silver">
          <section aria-labelledby="refund-general">
            <h2 id="refund-general" className="mb-3 text-2xl text-white sm:text-3xl">1. Общие положения</h2>
            <div className="space-y-3 leading-relaxed">
              <p>BezB стремится обеспечить корректное получение оплаченных цифровых товаров. Если при оплате, обработке заказа или активации товара возникла проблема, покупатель может обратиться в поддержку для проверки ситуации.</p>
              <p>Настоящие правила применяются с учётом законодательства Российской Федерации. Они не ограничивают обязательные права покупателя.</p>
            </div>
          </section>

          <section aria-labelledby="refund-cancel">
            <h2 id="refund-cancel" className="mb-3 text-2xl text-white sm:text-3xl">2. Отмена заказа до получения товара</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Если оплата произведена, но цифровой товар ещё не выдан покупателю, можно обратиться с просьбой отменить заказ и вернуть денежные средства.</p>
              <p>До выдачи товара заказ проверяется, чтобы исключить повторную выдачу, ошибочное зачисление или другие технические проблемы.</p>
            </div>
          </section>

          <section aria-labelledby="refund-order-data">
            <h2 id="refund-order-data" className="mb-3 text-2xl text-white sm:text-3xl">3. Ошибка в электронной почте или данных заказа</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Покупатель обязан внимательно проверять указанные при оформлении заказа данные.</p>
              <p>Если обнаружена ошибка, необходимо как можно скорее обратиться в поддержку и сообщить номер заказа и корректные сведения.</p>
              <p>Если товар ещё не выдан, BezB может исправить данные после проверки принадлежности заказа покупателю.</p>
              <p>Если товар уже выдан, возможность исправления зависит от способа выдачи и технических условий. Ошибка покупателя сама по себе не означает автоматического отказа в рассмотрении законного требования о возврате.</p>
            </div>
          </section>

          <section aria-labelledby="refund-defect">
            <h2 id="refund-defect" className="mb-3 text-2xl text-white sm:text-3xl">4. Код не работает или товар не соответствует описанию</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Если цифровой код не активируется, необходимо обратиться в поддержку и предоставить:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>номер заказа;</li>
                <li>описание ошибки;</li>
                <li>платформу и регион активации;</li>
                <li>скриншот сообщения об ошибке, если это возможно.</li>
              </ul>
              <p>Не следует публиковать в обращении полный код, пароль или другие секретные данные, если поддержка не запросила их через безопасный канал.</p>
              <p>BezB проверит информацию о заказе и обстоятельства возникновения проблемы. Если недостаток подтверждён, покупателю будет предложено предусмотренное законом решение, включая замену товара или возврат денежных средств в соответствующих случаях.</p>
            </div>
          </section>

          <section aria-labelledby="refund-region">
            <h2 id="refund-region" className="mb-3 text-2xl text-white sm:text-3xl">5. Ошибочный выбор региона или платформы</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Перед покупкой необходимо проверить совместимость товара с учётной записью, регионом и платформой.</p>
              <p>Если покупатель выбрал неподходящий товар, он может обратиться в поддержку. Возможность отмены, обмена или возврата рассматривается с учётом стадии исполнения заказа, характера цифрового товара и применимого законодательства.</p>
            </div>
          </section>

          <section aria-labelledby="refund-refusal">
            <h2 id="refund-refusal" className="mb-3 text-2xl text-white sm:text-3xl">6. Отказ от цифрового товара</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Условия отказа от товара и возврата денежных средств определяются применимым законодательством и обстоятельствами конкретной покупки.</p>
              <p>Сам факт того, что товар является цифровым, или то, что код был отправлен, не означает автоматического отказа покупателю в любых законных требованиях.</p>
            </div>
          </section>

          <section aria-labelledby="refund-method">
            <h2 id="refund-method" className="mb-3 text-2xl text-white sm:text-3xl">7. Сроки и способ возврата</h2>
            <div className="space-y-3 leading-relaxed">
              <p>После подтверждения основания для возврата денежные средства возвращаются способом, согласованным с покупателем и допустимым по закону.</p>
              <p>Срок возврата определяется применимыми законодательными требованиями и условиями используемого способа оплаты.</p>
            </div>
          </section>

          <section aria-labelledby="refund-support">
            <h2 id="refund-support" className="mb-3 text-2xl text-white sm:text-3xl">8. Как обратиться в поддержку</h2>
            <div className="space-y-3 leading-relaxed">
              <p>Для рассмотрения обращения укажите номер заказа, дату покупки и описание проблемы.</p>
              <p className="border-l-4 border-red bg-coal px-4 py-3">
                Контакт для обращений: [требуется указать и подтвердить действующий публичный адрес электронной почты]. Адрес пока не подтверждён и не является доступным каналом связи.
              </p>
              <p>Безопасность данных и проверка принадлежности заказа необходимы для предотвращения мошенничества и повторной выдачи товара.</p>
            </div>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/" className={btnSecondary}>Вернуться в магазин</Link>
          <Link to="/terms" className={btnSecondary}>Условия использования</Link>
          <Link to="/privacy" className={btnSecondary}>Политика конфиденциальности</Link>
        </div>
      </div>
    </article>
  )
}

import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function DeliveryPage() {
  useDocumentTitle('Получение товаров')

  return (
    <div className="container-x py-8 sm:py-12">
      <article className="max-w-3xl space-y-8 text-silver leading-relaxed">
        <header className="space-y-4">
          <h1 className="text-3xl text-white sm:text-6xl">Получение товаров</h1>
          <p>
            Все товары в BezB являются цифровыми, поэтому вам не нужно ждать курьера или получать физическую посылку.
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-2xl text-white sm:text-3xl">Как получить заказ</h2>
          <ol className="list-decimal space-y-3 pl-6 marker:font-semibold marker:text-white">
            <li>
              <strong className="text-white">Оформите заказ.</strong> Выберите товар, добавьте его в корзину и заполните
              необходимые данные для оформления.
            </li>
            <li>
              <strong className="text-white">Дождитесь обработки.</strong> После оформления заказ поступает в обработку.
              Вы можете проверить его статус на соответствующей странице, если такая возможность доступна для вашего
              заказа.
            </li>
            <li>
              <strong className="text-white">Получите товар.</strong> Способ получения зависит от типа приобретённого
              продукта. Это может быть цифровой код, данные для активации или другой предусмотренный для конкретного
              товара способ передачи.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-white sm:text-3xl">Сколько времени занимает получение?</h2>
          <p>
            Время обработки зависит от конкретного товара и текущей загрузки. Если для предложения указан срок выдачи,
            ориентируйтесь на информацию на странице товара.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-white sm:text-3xl">Что делать, если заказ не пришёл?</h2>
          <p>
            Если заказ долго находится в обработке или у вас возникли проблемы с получением, обратитесь в поддержку
            магазина, указав номер заказа и описание ситуации.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-2xl text-white sm:text-3xl">Важно перед покупкой</h2>
          <p>
            Перед оформлением заказа внимательно проверьте описание товара, регион активации и совместимость с вашей
            платформой. Некоторые цифровые продукты имеют ограничения по региону или способу использования.
          </p>
          <p className="mt-3">
            Условия получения могут различаться в зависимости от выбранного товара. Подробности уточняйте в его описании.
          </p>
        </section>
      </article>
    </div>
  )
}

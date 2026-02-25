import Link from "next/link";

const appLoginUrl = process.env.APP_LOGIN_URL ?? "https://app.snt-portal.ru/login";
const demoEmail = process.env.DEMO_EMAIL ?? "hello@snt-portal.ru";

const audience = [
  {
    title: "Председатель",
    description:
      "Управление объявлениями, документами, собраниями, платежами, инцидентами и коммуникацией с жителями в одном интерфейсе.",
  },
  {
    title: "Жители",
    description:
      "Оперативный доступ к новостям, голосованиям, документам, обращениям, платежам и чатам без бумажной рутины.",
  },
];

const features = [
  "Новости и уведомления по СНТ",
  "Документы, протоколы и архив",
  "Онлайн-голосования и собрания",
  "Инциденты, обращения и контроль статуса",
  "Карта участков, чаты и коммуникации",
  "Платформенная админ-панель, погода и локальное время СНТ",
];

const benefits = [
  {
    title: "Прозрачность решений",
    description:
      "История публикаций, документов и голосований всегда под рукой. Меньше спорных ситуаций и дублирования информации.",
  },
  {
    title: "Экономия времени",
    description:
      "Ключевые процессы переведены в цифровой формат. Председатель и жители тратят меньше времени на организационные вопросы.",
  },
  {
    title: "Единый контур управления",
    description:
      "Коммуникации, платежи, инциденты и сервисные функции объединены в одном продукте с понятной моделью ролей.",
  },
];

const faq = [
  {
    question: "Сколько времени занимает запуск?",
    answer:
      "Базовый запуск занимает от 1 до 3 рабочих дней: подключение СНТ, настройка ролей и первичное наполнение.",
  },
  {
    question: "Нужно ли устанавливать отдельные программы?",
    answer:
      "Нет. Портал работает в браузере по защищенному HTTPS-доступу. Мобильный клиент можно подключить отдельно.",
  },
  {
    question: "Можно ли управлять несколькими СНТ?",
    answer:
      "Да. Платформенная панель администратора позволяет управлять несколькими СНТ и пользователями в едином контуре.",
  },
];

export default function LandingPage() {
  return (
    <main className="page">
      <section className="hero reveal">
        <p className="hero-kicker">Цифровой портал для СНТ</p>
        <h1>SNTPortal объединяет жителей и председателя в одном рабочем контуре</h1>
        <p className="hero-text">
          Коммуникации, документы, голосования, платежи, инциденты и сервисные функции работают в единой платформе.
          Без разрозненных чатов и ручного учета.
        </p>
        <div className="hero-actions">
          <a href={`mailto:${demoEmail}`} className="btn btn-primary">
            Запросить демо
          </a>
          <Link href={appLoginUrl} className="btn btn-secondary">
            Войти в систему
          </Link>
        </div>
      </section>

      <section className="panel reveal">
        <div className="section-head">
          <h2>Для кого</h2>
        </div>
        <div className="grid-two">
          {audience.map((item) => (
            <article key={item.title} className="card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel reveal">
        <div className="section-head">
          <h2>Функции платформы</h2>
        </div>
        <ul className="feature-list">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="panel reveal">
        <div className="section-head">
          <h2>Почему это работает</h2>
        </div>
        <div className="grid-three">
          {benefits.map((item) => (
            <article key={item.title} className="card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel reveal">
        <div className="section-head">
          <h2>FAQ</h2>
        </div>
        <div className="faq-list">
          {faq.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="panel contact reveal">
        <h2>Контакты</h2>
        <p>Чтобы подключить СНТ или получить презентацию, напишите нам.</p>
        <a href={`mailto:${demoEmail}`} className="contact-link">
          {demoEmail}
        </a>
      </section>

      <footer className="footer">
        <p>© {new Date().getFullYear()} SNTPortal</p>
        <Link href={appLoginUrl}>Перейти в приложение</Link>
      </footer>
    </main>
  );
}

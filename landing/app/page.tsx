import Image from "next/image";

const appLoginUrl = process.env.APP_LOGIN_URL ?? "https://app.snt-portal.ru/login";
const demoEmail = process.env.DEMO_EMAIL ?? "hello@snt-portal.ru";
const landingBaseUrl = (process.env.LANDING_BASE_URL ?? "https://snt-portal.ru").replace(/\/$/, "");
const visuals = {
  hero: "/images/landing/hero-abstract-v1.webp",
  audience: "/images/landing/audience-abstract-v1.webp",
  features: "/images/landing/features-abstract-v1.webp",
  benefits: "/images/landing/benefits-abstract-v1.webp",
};

const navItems = [
  { href: "#audience", label: "Для кого" },
  { href: "#features", label: "Функции" },
  { href: "#benefits", label: "Преимущества" },
  { href: "#faq", label: "FAQ" },
];

const signalItems = [
  "Коммуникации в реальном времени",
  "Цифровые голосования без бумажной нагрузки",
  "Единый контур жителей и председателя",
  "Контроль обращений и платежей",
];

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
  {
    title: "Коммуникации",
    description: "Новости, push-уведомления и чаты по СНТ без расфокуса по разным каналам.",
  },
  {
    title: "Документы и голосования",
    description: "Протоколы, архив, собрания и онлайн-голосования в едином юридически понятном контуре.",
  },
  {
    title: "Инциденты и обращения",
    description: "Прием, приоритизация и контроль выполнения заявок с прозрачным статусом для жителей.",
  },
  {
    title: "Карта и платежи",
    description: "Цифровая карта участков и управляемые регулярные платежи без ручного учета.",
  },
  {
    title: "Платформенная админка",
    description: "Управление пользователями и несколькими СНТ в отдельной панели администратора.",
  },
  {
    title: "Локальная погода",
    description: "Виджет времени и температуры по координатам СНТ прямо на главном экране.",
  },
];

const metrics = [
  {
    value: "до 65%",
    title: "быстрее обработка обращений",
    note: "пример внедрения",
  },
  {
    value: "до 80%",
    title: "голосований в цифровом виде",
    note: "пример внедрения",
  },
  {
    value: "< 5 мин",
    title: "публикация новостей и уведомлений",
    note: "пример внедрения",
  },
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

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${landingBaseUrl}/#organization`,
    name: "SNTPortal",
    url: `${landingBaseUrl}/`,
    logo: `${landingBaseUrl}/favicon.ico`,
    email: demoEmail,
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${landingBaseUrl}/#website`,
    name: "SNTPortal",
    url: `${landingBaseUrl}/`,
    inLanguage: "ru-RU",
    publisher: {
      "@id": `${landingBaseUrl}/#organization`,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SNTPortal",
    url: `${landingBaseUrl}/`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    inLanguage: "ru-RU",
    description:
      "Единая цифровая платформа для СНТ: коммуникации, документы, голосования, обращения и платежи.",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  },
];

export default function LandingPage() {
  return (
    <main className="site">
      {structuredData.map((item, index) => (
        <script
          key={`ld-json-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
      <header className="topbar reveal">
        <a href="#top" className="brand">
          <span className="brand-dot" />
          <span>SNTPortal</span>
        </a>
        <nav className="menu" aria-label="Навигация лендинга">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a href={appLoginUrl} className="btn btn-small btn-ghost">
          Войти
        </a>
      </header>
      <div className="signal-strip reveal" aria-hidden="true">
        <div className="signal-track">
          {signalItems.map((item) => (
            <span key={`signal-a-${item}`}>{item}</span>
          ))}
          {signalItems.map((item) => (
            <span key={`signal-b-${item}`}>{item}</span>
          ))}
        </div>
      </div>

      <section className="hero reveal" id="top">
        <div className="hero-art-wrap" aria-hidden="true">
          <Image
            src={visuals.hero}
            alt=""
            fill
            priority
            sizes="(max-width: 860px) 100vw, (max-width: 1080px) 90vw, 720px"
            className="hero-art"
          />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">Цифровая платформа для СНТ</p>
          <div className="hero-signals" aria-hidden="true">
            <span>оперативный контур</span>
            <span>цифровой документооборот</span>
            <span>resident flow</span>
          </div>
          <h1>
            Умный контур
            <br />
            <span>управления</span>
            <br />
            для жителей и председателя
          </h1>
          <p className="lead">
            SNTPortal объединяет коммуникации, документы, голосования, обращения и платежи в одном рабочем
            пространстве. Меньше хаоса, больше управляемости.
          </p>
          <div className="actions">
            <a href={`mailto:${demoEmail}`} className="btn btn-primary">
              Запросить демо
            </a>
            <a href={appLoginUrl} className="btn btn-ghost">
              Войти в систему
            </a>
          </div>
        </div>

        <div className="hero-frame" aria-hidden="true">
          <div className="frame-surface">
            <p className="surface-title">Контроль в реальном времени</p>
            <ul className="surface-list">
              <li>
                <span>Новости</span>
                <b>Опубликовано 2 мин назад</b>
              </li>
              <li>
                <span>Голосование</span>
                <b>Участие 74%</b>
              </li>
              <li>
                <span>Инциденты</span>
                <b>3 новых обращения</b>
              </li>
            </ul>
          </div>
          <div className="glass-chip chip-one">Погода СНТ +12°C</div>
          <div className="glass-chip chip-two">Платежи синхронизированы</div>
        </div>
      </section>

      <section className="metric-grid reveal" aria-label="Ключевые метрики">
        {metrics.map((item, index) => (
          <article key={item.title} className={`metric-card metric-card-${index + 1}`}>
            <p className="metric-value">{item.value}</p>
            <p className="metric-title">{item.title}</p>
            <span>{item.note}</span>
          </article>
        ))}
      </section>

      <section className="section section-audience reveal" id="audience">
        <div className="section-head">
          <p className="section-code">01 / audience</p>
          <h2>Для кого</h2>
          <p>Разные роли, единые процессы и прозрачная операционная модель внутри СНТ.</p>
        </div>
        <div className="section-visual section-visual-audience" aria-hidden="true">
          <Image
            src={visuals.audience}
            alt=""
            fill
            sizes="(max-width: 860px) 100vw, 1120px"
            className="section-visual-image"
          />
        </div>
        <div className="card-grid two">
          {audience.map((item) => (
            <article key={item.title} className="card audience-card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-features reveal" id="features">
        <div className="section-head">
          <p className="section-code">02 / capability grid</p>
          <h2>Ключевые функции</h2>
          <p>Все, что нужно для ежедневного управления СНТ, собрано в одном продукте.</p>
        </div>
        <div className="section-visual section-visual-features" aria-hidden="true">
          <Image
            src={visuals.features}
            alt=""
            fill
            sizes="(max-width: 860px) 100vw, 1120px"
            className="section-visual-image"
          />
        </div>
        <div className="card-grid three">
          {features.map((feature, index) => (
            <article key={feature.title} className="card feature-card">
              <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-benefits reveal" id="benefits">
        <div className="section-head">
          <p className="section-code">03 / impact</p>
          <h2>Почему это выгодно</h2>
          <p>Платформа снижает ручную нагрузку и делает решения внутри СНТ прозрачными для всех сторон.</p>
        </div>
        <div className="section-visual section-visual-benefits" aria-hidden="true">
          <Image
            src={visuals.benefits}
            alt=""
            fill
            sizes="(max-width: 860px) 100vw, 1120px"
            className="section-visual-image"
          />
        </div>
        <div className="card-grid three">
          {benefits.map((item) => (
            <article key={item.title} className="card benefit-card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section reveal" id="faq">
        <div className="section-head">
          <p className="section-code">04 / faq</p>
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

      <section className="section contact reveal" id="contacts">
        <p className="section-code">05 / next step</p>
        <h2>Запросить демо</h2>
        <p>Покажем продукт на ваших сценариях и дадим план запуска для конкретного СНТ.</p>
        <a href={`mailto:${demoEmail}`} className="contact-link">
          {demoEmail}
        </a>
      </section>

      <footer className="footer">
        <p>© {new Date().getFullYear()} SNTPortal</p>
        <div className="footer-links">
          <a href="#top">Наверх</a>
          <a href={appLoginUrl}>Войти в приложение</a>
        </div>
      </footer>
    </main>
  );
}

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>СНТ Портал</h1>
        <p>
          Единый портал жителей и председателя: платежи, карта поселка, новости,
          форум, документы, обращения и собрания.
        </p>

        <div className="auth-actions">
          <Link href="/login" className="primary-button">
            Войти по OTP
          </Link>
          <Link href="/register-snt" className="secondary-button">
            Регистрация СНТ
          </Link>
        </div>
      </section>
    </main>
  );
}

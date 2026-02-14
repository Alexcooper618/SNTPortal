import { ReactNode } from "react";

interface PanelProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

export const Panel = ({ title, children, action }: PanelProps) => {
  return (
    <article className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {action ? <div>{action}</div> : null}
      </header>
      <div>{children}</div>
    </article>
  );
};

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

export const StatCard = ({ label, value, hint }: StatProps) => {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
};

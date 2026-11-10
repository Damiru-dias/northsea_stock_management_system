export function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><div className="eyebrow muted-eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

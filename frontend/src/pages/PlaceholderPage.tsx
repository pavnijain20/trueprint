export function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="placeholder-page" aria-labelledby="page-title">
      <p className="eyebrow">TRUEPRINT WORKSPACE</p>
      <h1 id="page-title">{title}</h1>
      <p>{description}</p>
    </section>
  )
}
import type { ReviewRisk } from '../types'

const severityLabel = { high: 'High', medium: 'Medium', low: 'Low' } as const

export function RiskBreakdown({ risk }: { risk: ReviewRisk }) {
  const level = risk.level.toLowerCase()
  const needsSpecialist = level === 'high'
  const contributions = [...risk.contributions].sort((a, b) => b.points - a.points)

  return (
    <section aria-labelledby="risk-breakdown-title" className="risk-breakdown">
      <h2 id="risk-breakdown-title">
        Risk: {risk.level} <span>({risk.score})</span>
      </h2>
      <p className="risk-formula">
        Score = severity x confidence x category weight, added up for each validated finding.
      </p>
      {needsSpecialist && (
        <p className="risk-specialist" role="status">
          High risk: a specialist reviewer (legal or compliance) should check this draft before approval.
        </p>
      )}
      {contributions.length === 0 ? (
        <p>No findings add to the risk score.</p>
      ) : (
        <table className="risk-table">
          <caption className="sr-only">Findings that add to the risk score</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Severity</th>
              <th scope="col">Points</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((item, index) => (
              <tr key={`${item.finding}-${index}`}>
                <th scope="row">{item.category}</th>
                <td>{severityLabel[item.severity]}</td>
                <td>{item.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

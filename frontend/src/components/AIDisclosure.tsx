import './ai-disclosure.css'

export function AIDisclosure() {
  return (
    <details className="ai-disclosure">
      <summary>AI use and external services</summary>
      <div className="ai-disclosure-content">
        <p>Findings are labelled AI-generated or rule-based. Rule-based checks run in our own code.</p>
        <p>Each AI finding shows its confidence, the approved source it quotes, and a suggested fix.</p>
        <p>AI review and Suggest a corrected draft send your draft text and the relevant approved guideline passages to an external language model service.</p>
        <p>Nothing is applied automatically. AI suggests, people decide.</p>
        <p>Do not paste confidential personal data into drafts.</p>
      </div>
    </details>
  )
}

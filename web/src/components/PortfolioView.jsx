// Shows one flexible Portfolios document from MongoDB in a readable way.
// Portfolios don't all have the same fields (that's the point of a document store),
// so every optional section only renders when the field exists.

export function PortfolioView({ doc }) {
  if (!doc) return <div className="muted">No portfolio on file.</div>;
  const known = ['freelancer_id', 'display_name', 'headline', 'hourly_rate_inr', 'skills', 'languages',
    'past_projects', 'certifications', 'links', 'availability'];
  const extra = Object.keys(doc).filter(k => !known.includes(k));

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{doc.display_name}</div>
        <div className="muted">{doc.headline}{doc.hourly_rate_inr ? ` · ₹${doc.hourly_rate_inr}/hour` : ''}</div>
      </div>

      {doc.skills?.length > 0 && (
        <div><h3>Skills</h3>
          <div className="chips">{doc.skills.map(s => <span className="chip" key={s.name}>{s.name} · {s.years}y</span>)}</div>
        </div>
      )}
      {doc.languages?.length > 0 && (
        <div><h3>Languages</h3><div className="chips">{doc.languages.map(l => <span className="chip" key={l}>{l}</span>)}</div></div>
      )}
      {doc.past_projects?.length > 0 && (
        <div><h3>Past projects</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {doc.past_projects.map((p, i) => <li key={i}>{p.title} <span className="muted">({p.year}{p.tech?.length ? ` · ${p.tech.join(', ')}` : ''})</span></li>)}
          </ul>
        </div>
      )}
      {doc.certifications?.length > 0 && (
        <div><h3>Certifications</h3><div className="chips">{doc.certifications.map(c => <span className="chip" key={c}>{c}</span>)}</div></div>
      )}
      {doc.availability && (
        <div><h3>Availability</h3>
          <span className="muted">
            {doc.availability.weekdays ? 'Weekdays' : 'No weekdays'} · {doc.availability.weekends ? 'Weekends' : 'No weekends'} · {doc.availability.hours_per_week} h/week
          </span>
        </div>
      )}
      {doc.links && (
        <div><h3>Links</h3>{Object.entries(doc.links).map(([k, v]) => <div key={k}>{k}: <a href={v} target="_blank" rel="noreferrer">{v}</a></div>)}</div>
      )}
      {extra.length > 0 && (
        <div><h3>Other fields</h3><pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(Object.fromEntries(extra.map(k => [k, doc[k]])), null, 2)}</pre></div>
      )}
      <details>
        <summary className="muted" style={{ cursor: 'pointer' }}>Show raw MongoDB document</summary>
        <pre className="mono" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(doc, null, 2)}</pre>
      </details>
    </div>
  );
}

import type { ShowcaseContent } from '../../../api/leads';

export function ShowcasePreview({
  content,
  renderedHtml,
}: {
  readonly content: ShowcaseContent | null;
  readonly renderedHtml: string | null;
}): React.JSX.Element {
  const previewHtml = renderedHtml ?? (content === null ? null : createDraftPreview(content));
  return (
    <section className="preview-card" aria-labelledby="preview-title">
      <div className="preview-toolbar">
        <div>
          <span className="eyebrow">Recipient view</span>
          <h2 id="preview-title">Email preview</h2>
        </div>
        <span className="preview-label">{renderedHtml ? 'Shared template' : 'Unsaved draft'}</span>
      </div>
      {previewHtml === null ? (
        <div className="preview-empty">
          <p>Generate a showcase to preview the shared React Email template.</p>
        </div>
      ) : (
        <div className="email-canvas">
          <iframe title="Showcase email preview" srcDoc={previewHtml} sandbox="" />
        </div>
      )}
    </section>
  );
}

function createDraftPreview(content: ShowcaseContent): string {
  const services = content.selectedServices.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const observations = content.observations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const warning = content.masterDataWarning
    ? `<p class="warning">${escapeHtml(content.masterDataWarning)}</p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>body{margin:0;padding:28px;background:#f6f7fb;color:#182230;font:14px Arial,sans-serif}main{max-width:520px;margin:auto;padding:30px;background:#fff;border-radius:12px}h1{font-size:24px}h2{font-size:16px;margin-top:24px}li{margin:6px 0}.warning{padding:12px;background:#fff7e6;color:#7a4b00;border-radius:6px}a{display:inline-block;padding:12px 18px;background:#155eef;color:#fff;text-decoration:none;border-radius:6px}</style></head><body><main><h1>Your property showcase</h1><p>${escapeHtml(content.greeting)}</p><p>${escapeHtml(content.propertySummary)}</p>${warning}<h2>Recommended services</h2><ul>${services}</ul><h2>What we know</h2><ul>${observations}</ul><a href="mailto:sales@bestairbnb.example">${escapeHtml(content.callToAction)}</a></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

import {
  extractVisualIdentityFromHtml,
  mergeVisualIdentityEvidence,
  visualIdentityFromEvidenceText,
} from './visual-identity-from-html.util';

const SAMPLE_HTML = `<!doctype html>
<html class="minimal">
<head>
  <meta name="theme-color" content="#1B4F72" />
  <meta name="description" content="Acme skincare" />
  <style>
    :root {
      --color-primary: #1B4F72;
      --secondary: #F5CBA7;
      --accent: #E74C3C;
      --muted: #F4F6F7;
    }
    body { font-family: "Inter", system-ui, sans-serif; color: #1B4F72; }
    .hero { background: #1B4F72; }
    .cta { background: rgb(231, 76, 60); }
  </style>
  <link rel="stylesheet" href="/assets/app.css" />
</head>
<body class="hero-led photography">
  <header><h1>Acme</h1></header>
  <main class="gallery">
    <p>Premium skincare photography and clean packaging.</p>
  </main>
</body>
</html>`;

const NO_COLOR_HTML = `<!doctype html>
<html><head><title>Plain</title></head>
<body><p>Hello world with no theme.</p></body></html>`;

describe('extractVisualIdentityFromHtml', () => {
  it('pulls theme-color, css vars, fonts, and design keywords from fixtures (no network)', () => {
    const { evidenceText, visualIdentity } = extractVisualIdentityFromHtml(SAMPLE_HTML);
    expect(evidenceText).toContain('VISUAL IDENTITY EVIDENCE');
    expect(evidenceText).toContain('#1b4f72');
    expect(visualIdentity.primary).toBe('#1b4f72');
    expect(visualIdentity.secondary).toBe('#f5cba7');
    expect(visualIdentity.accent).toBe('#e74c3c');
    expect(visualIdentity.fonts).toEqual(expect.arrayContaining(['Inter']));
    expect(visualIdentity.designKeywords?.length).toBeGreaterThan(0);
    expect(visualIdentity.designDirection).toMatch(/typography|imagery|external stylesheets/i);
    expect(visualIdentity.colorsUnknown).toBeUndefined();
  });

  it('marks colors unknown when HTML has no evidenced hex', () => {
    const { visualIdentity, evidenceText } = extractVisualIdentityFromHtml(NO_COLOR_HTML);
    expect(visualIdentity.primary).toBeUndefined();
    expect(visualIdentity.colorsUnknown).toBe(true);
    expect(evidenceText).toMatch(/No reliable theme hex/i);
  });
});

describe('visualIdentityFromEvidenceText + merge', () => {
  it('re-parses the evidence block and prefers it over LLM-invented hex', () => {
    const { evidenceText, visualIdentity } = extractVisualIdentityFromHtml(SAMPLE_HTML);
    const fromText = visualIdentityFromEvidenceText(evidenceText);
    expect(fromText?.primary).toBe('#1b4f72');

    const merged = mergeVisualIdentityEvidence(
      { primary: '#abcdef', designKeywords: ['llm-only'] },
      visualIdentity,
    );
    expect(merged?.primary).toBe('#1b4f72');
    expect(merged?.primary).not.toBe('#abcdef');
  });

  it('strips LLM colors when evidence has none', () => {
    const merged = mergeVisualIdentityEvidence(
      { primary: '#abcdef', designDirection: 'Something nice' },
      { colorsUnknown: true, designKeywords: ['minimal'] },
    );
    expect(merged?.primary).toBeUndefined();
    expect(merged?.colorsUnknown).toBe(true);
    expect(merged?.designKeywords).toEqual(['minimal']);
  });
});

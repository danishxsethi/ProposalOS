import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const exportRoute = readFileSync(
  join(root, 'app/api/presentation/[token]/export/route.ts'),
  'utf8'
);
const publicPage = readFileSync(join(root, 'app/presentation/[token]/page.tsx'), 'utf8');
const presentationUi = readFileSync(
  join(root, 'app/presentation/[token]/PresentationClient.tsx'),
  'utf8'
);

describe('PPTX image-parser reachability boundary', () => {
  it('builds presentations only from the approved public proposal projection and text/shapes', () => {
    expect(exportRoute).toContain('resolvePublicProposalAccess(token)');
    expect(exportRoute).toContain('proposal.audit.findings');
    expect(exportRoute).toContain('pres.addSlide()');
    expect(exportRoute).toContain('addText(');
    expect(exportRoute).toContain('addShape(');
    expect(exportRoute).not.toMatch(/\baddImage\s*\(/);
    expect(exportRoute).not.toMatch(/image(?:Data|Sizing|Buffer|Bytes)|\bimage\s*:/i);
    expect(exportRoute).not.toMatch(/proposal\.audit\.(?:evidence|rawResponse)/);
    expect(exportRoute).not.toMatch(/prisma\.(?:proposal|audit|finding)/);
  });

  it('uses the shared public access resolver before rendering the hosted presentation', () => {
    expect(publicPage).toContain('resolvePublicProposalAccess(token)');
    expect(publicPage).toContain('<PresentationClient proposal={access.proposal}');
    expect(publicPage).not.toMatch(/prisma\.(?:proposal|audit|finding)/);
  });

  it('keeps hosted proposal and PDF downloads available alongside PPTX', () => {
    expect(presentationUi).toContain('/api/proposal/token/${proposal.webLinkToken}/pdf');
    expect(presentationUi).toContain('/api/presentation/${proposal.webLinkToken}/export');
  });
});

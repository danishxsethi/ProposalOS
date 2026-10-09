// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SampleReportPage from '@/app/(marketing)/demo/sample-report/page';

describe('public sample report truthfulness', () => {
  it('labels synthetic content and avoids presenting mock claims as customer evidence', () => {
    render(<SampleReportPage />);

    expect(screen.getByText(/synthetic demonstration/i)).toBeInTheDocument();
    expect(screen.getByText(/no real website was audited/i)).toBeInTheDocument();
    expect(screen.getByText(/not quoted in this synthetic demo/i)).toBeInTheDocument();
    expect(screen.queryByText(/losing 20-30% of traffic/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SmileDirect/i)).not.toBeInTheDocument();
  });
});

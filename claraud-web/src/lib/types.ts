export interface ScanRequest {
  url: string;
  businessName?: string;
  city?: string;
  industry?: string;
}

export interface ScanStatus {
  token: string;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  modules: ModuleStatus[];
  overallScore?: number;
  progress?: number;
}

export interface ModuleStatus {
  id: string;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  score?: number;
  findingsCount?: number;
}

export interface ReportData {
  token: string;
  businessName: string;
  businessUrl: string;
  overallScore: number;
  letterGrade: string;
  categories: CategoryScore[];
  findings: Finding[];
  competitors: Competitor[];
}

export interface CategoryScore {
  id: string;
  name: string;
  score: number;
  summary: string;
}

export interface Finding {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  impact: string;
  evidence?: string;
  fixComplexity: 'quick-win' | 'moderate' | 'complex';
}

export interface Competitor {
  name: string;
  url: string;
  overallScore: number;
  reviewCount: number;
  pageSpeed: number;
  gbpCompleteness: number;
}

export interface Lead {
  email: string;
  businessUrl: string;
  scanToken: string;
  scores: Record<string, number>;
}
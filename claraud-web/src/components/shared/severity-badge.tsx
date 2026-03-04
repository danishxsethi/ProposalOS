import { Badge } from '@/components/ui/badge';

export function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' | 'low' }) {
  const map = {
    critical: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Critical' },
    high:     { bg: 'bg-orange-500/10', text: 'text-orange-500', label: 'High' },
    medium:   { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Medium' },
    low:      { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Low' }
  };
  const { bg, text, label } = map[severity];
  
  return (
    <Badge variant="outline" className={`${bg} ${text} border-transparent hover:${bg} font-semibold`}>
      {label}
    </Badge>
  );
}
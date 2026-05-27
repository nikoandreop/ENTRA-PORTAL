import { formatDistanceToNow, format } from 'date-fns';

export function timeAgo(date: string | Date | null): string {
  if (!date) return 'Never';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '-';
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

export function statusColor(status: string): string {
  switch (status) {
    case 'active': case 'connected': case 'enabled': return 'bg-green-100 text-green-800';
    case 'suspended': case 'degraded': case 'disabled': return 'bg-yellow-100 text-yellow-800';
    case 'disconnected': case 'offboarding': return 'bg-red-100 text-red-800';
    case 'onboarding': case 'provisioning': return 'bg-blue-100 text-blue-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function compactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Garnet design token utilities
 * CSS class counterparts defined in app/globals.css
 */

export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'running' | 'neutral';

/**
 * Returns the CSS class for a status badge.
 * Use with the .status-badge base class:
 *   <span className={`status-badge ${getStatusBadgeClass('success')}`}>확정</span>
 */
export function getStatusBadgeClass(variant: StatusBadgeVariant): string {
  return `status-badge-${variant}`;
}

/**
 * Maps common status string values to a badge variant.
 * Extend as needed for domain-specific statuses.
 */
export function statusToVariant(status: string): StatusBadgeVariant {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':
    case 'DONE':
    case 'COMPLETED':
    case 'ACTIVE':
    case 'PUBLISHED':
      return 'success';

    case 'DRAFT':
    case 'PENDING':
    case 'WAITING':
    case 'SCHEDULED':
      return 'warning';

    case 'FAILED':
    case 'ERROR':
    case 'CANCELLED':
    case 'REJECTED':
      return 'error';

    case 'RUNNING':
    case 'IN_PROGRESS':
    case 'PROCESSING':
      return 'running';

    case 'INFO':
    case 'REVIEW':
    case 'READY':
      return 'info';

    default:
      return 'neutral';
  }
}

/**
 * Convenience: get the full class string for a status string.
 *   <span className={getStatusColor('CONFIRMED')}>확정</span>
 */
export function getStatusColor(status: string): string {
  return `status-badge ${getStatusBadgeClass(statusToVariant(status))}`;
}

/**
 * @deprecated Use lib/auth/rbac.ts instead.
 * This file is a re-export for backward compatibility.
 */
export {
  type Role,
  PERMISSIONS,
  ROLE_HIERARCHY,
  getCurrentRole,
  hasRole,
  withRole,
} from '@/lib/auth/rbac';

/** Subdomínios reservados — não podem ser usados por famílias. */
export const RESERVED_SUBDOMAINS = new Set([
  'admin', 'api', 'www', 'app', 'mail', 'email', 'smtp', 'imap', 'pop',
  'ftp', 'ns', 'ns1', 'ns2', 'dns', 'mx', 'root', 'support', 'help',
  'status', 'blog', 'dev', 'staging', 'test', 'demo', 'static', 'cdn',
  'assets', 'img', 'images', 'files', 'docs', 'pay', 'payment', 'billing',
  'account', 'accounts', 'auth', 'login', 'signup', 'register', 'dashboard',
  'financaslivre', 'security', 'no-reply', 'noreply', 'system', 'internal',
]);

export const TENANT_STATUSES = ['pending', 'active', 'suspended', 'deleted'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export function isTenantStatus(v: unknown): v is TenantStatus {
  return typeof v === 'string' && (TENANT_STATUSES as readonly string[]).includes(v);
}

export function isReservedSubdomain(sub: string): boolean {
  return RESERVED_SUBDOMAINS.has(sub.toLowerCase());
}

/**
 * The identity established by a valid API key. After ApiKeyGuard runs, this is
 * attached to `request.apiKeyContext` so gateway handlers know WHO is calling
 * (which key, which app, which tenant) without re-querying.
 */
export interface ApiKeyContextData {
  keyId: string;
  applicationId: string;
  organizationId: string;
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyContextData } from '../api-key-context.interface';
import { ApiKeysService } from '../api-keys.service';

// The header clients send their key in. We use a dedicated header (not
// `Authorization: Bearer`, which we reserved for user JWTs) so the two auth
// mechanisms never collide.
const API_KEY_HEADER = 'x-api-key';

/**
 * ApiKeyGuard — authenticates a CLIENT APPLICATION by its API key.
 *
 * This is the platform's SECOND authentication mechanism:
 *   - JwtAuthGuard  → a human user logged into the dashboard
 *   - ApiKeyGuard   → a machine/client app calling the gateway
 *
 * Flow: read the key from the header → hash + look it up (rejecting revoked or
 * expired keys) → record the usage → attach the caller's identity to the request.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      apiKey?: unknown;
      apiKeyContext?: ApiKeyContextData;
    }>();

    const raw = request.headers[API_KEY_HEADER];
    const presented = Array.isArray(raw) ? raw[0] : raw;
    if (!presented) {
      throw new UnauthorizedException('Missing API key');
    }

    // findValidByPlaintext hashes the key, looks it up, and returns null if it
    // doesn't exist, is revoked, or has expired.
    const key = await this.apiKeysService.findValidByPlaintext(presented);
    if (!key) {
      // Same generic message for unknown/revoked/expired — don't leak which.
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    // Usage tracking. We await it for correctness; a high-throughput gateway
    // would batch these writes (or push to a queue) — a later optimization.
    await this.apiKeysService.recordUsage(key);

    request.apiKey = key;
    request.apiKeyContext = {
      keyId: key.id,
      applicationId: key.applicationId,
      organizationId: key.organizationId,
    };
    return true;
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ApplicationsService } from '../applications/applications.service';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly keyRepo: Repository<ApiKey>,
    private readonly applicationsService: ApplicationsService,
    private readonly config: ConfigService,
  ) {}

  // ---- Crypto helpers -------------------------------------------------------

  /**
   * Hash a key with SHA-256 (hex).
   *
   * WHY NOT bcrypt? bcrypt is deliberately SLOW to defend *low-entropy*
   * passwords against brute force. API keys are 256 bits of RANDOM data — they
   * can't be brute-forced regardless — so a slow hash would only punish the
   * gateway, which must verify a key on EVERY request. A fast deterministic
   * hash (SHA-256) is the right tool here, and being deterministic lets us look
   * the key up by its hash directly.
   */
  private hash(fullKey: string): string {
    return createHash('sha256').update(fullKey).digest('hex');
  }

  /** Build a brand-new key: `dk_<env>_<43 random chars>`. */
  private generate(): {
    fullKey: string;
    prefix: string;
    last4: string;
    keyHash: string;
  } {
    const env =
      this.config.get<string>('app.env') === 'production' ? 'live' : 'test';
    const prefix = `dk_${env}`;
    // 32 random bytes -> ~43 url-safe chars. Unguessable.
    const secret = randomBytes(32).toString('base64url');
    const fullKey = `${prefix}_${secret}`;
    return {
      fullKey,
      prefix,
      last4: secret.slice(-4),
      keyHash: this.hash(fullKey),
    };
  }

  // ---- Management API -------------------------------------------------------

  /**
   * Create a key for an app. Returns the plaintext key ONCE — the only time it
   * ever exists outside the client.
   */
  async create(orgId: string, appId: string, dto: CreateApiKeyDto) {
    // Ensures the app exists AND belongs to this org (tenant scoping).
    await this.applicationsService.findOneOrThrow(orgId, appId);

    const { fullKey, prefix, last4, keyHash } = this.generate();
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const entity = this.keyRepo.create({
      name: dto.name,
      prefix,
      last4,
      keyHash,
      applicationId: appId,
      organizationId: orgId,
      expiresAt,
    });
    const saved = await this.keyRepo.save(entity);

    return {
      // The plaintext key — shown exactly once.
      key: fullKey,
      warning: 'Store this key now. For security it will never be shown again.',
      ...this.toResponse(saved),
    };
  }

  /** List an app's keys (masked — never the hash or plaintext). */
  async findAllForApp(orgId: string, appId: string) {
    await this.applicationsService.findOneOrThrow(orgId, appId);
    const keys = await this.keyRepo.find({
      where: { organizationId: orgId, applicationId: appId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((k) => this.toResponse(k));
  }

  /** One key's metadata + usage. */
  async findOne(orgId: string, appId: string, keyId: string) {
    const key = await this.findKeyOrThrow(orgId, appId, keyId);
    return this.toResponse(key);
  }

  /** Revoke a key immediately (soft — kept for audit/usage history). */
  async revoke(orgId: string, appId: string, keyId: string) {
    const key = await this.findKeyOrThrow(orgId, appId, keyId);
    if (key.revokedAt) {
      throw new BadRequestException('Key is already revoked');
    }
    key.revokedAt = new Date();
    await this.keyRepo.save(key);
    return this.toResponse(key);
  }

  /**
   * Rotate a key: revoke the old one and issue a brand-new key with the same
   * name and expiry. Returns the new plaintext once.
   *
   * (A production system might keep the old key valid for a short grace period
   * to allow zero-downtime rollout; we do a clean swap here for clarity.)
   */
  async rotate(orgId: string, appId: string, keyId: string) {
    const old = await this.findKeyOrThrow(orgId, appId, keyId);
    if (old.revokedAt) {
      throw new BadRequestException('Cannot rotate a revoked key');
    }

    const { fullKey, prefix, last4, keyHash } = this.generate();
    const replacement = this.keyRepo.create({
      name: old.name,
      prefix,
      last4,
      keyHash,
      applicationId: appId,
      organizationId: orgId,
      expiresAt: old.expiresAt,
    });

    // Revoke old + save new in one transaction.
    await this.keyRepo.manager.transaction(async (manager) => {
      old.revokedAt = new Date();
      await manager.save(old);
      await manager.save(replacement);
    });

    return {
      key: fullKey,
      warning: 'Store this key now. For security it will never be shown again.',
      rotatedFrom: old.id,
      ...this.toResponse(replacement),
    };
  }

  // ---- Used by the gateway in Step 7 ---------------------------------------

  /**
   * Look up a VALID key by its plaintext: hash it, find the row, reject if
   * revoked or expired. Returns the key entity or null. (Wired into an
   * authentication guard in Step 7.)
   */
  async findValidByPlaintext(fullKey: string): Promise<ApiKey | null> {
    const key = await this.keyRepo.findOne({
      where: { keyHash: this.hash(fullKey) },
    });
    if (!key) return null;
    if (key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;
    return key;
  }

  /** Record a use of the key (called by the gateway after a successful auth). */
  async recordUsage(key: ApiKey): Promise<void> {
    await this.keyRepo.update(key.id, {
      lastUsedAt: new Date(),
      usageCount: Number(key.usageCount) + 1,
    });
  }

  // ---- Internals ------------------------------------------------------------

  private async findKeyOrThrow(
    orgId: string,
    appId: string,
    keyId: string,
  ): Promise<ApiKey> {
    const key = await this.keyRepo.findOne({
      where: { id: keyId, applicationId: appId, organizationId: orgId },
    });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    return key;
  }

  /** Safe, masked view of a key for API responses (never exposes hash/secret). */
  private toResponse(key: ApiKey) {
    return {
      id: key.id,
      name: key.name,
      maskedKey: `${key.prefix}_${'•'.repeat(8)}${key.last4}`,
      status: this.statusOf(key),
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      lastUsedAt: key.lastUsedAt,
      usageCount: Number(key.usageCount),
      createdAt: key.createdAt,
    };
  }

  private statusOf(key: ApiKey): 'active' | 'revoked' | 'expired' {
    if (key.revokedAt) return 'revoked';
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return 'expired';
    return 'active';
  }
}

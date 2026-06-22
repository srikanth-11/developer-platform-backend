import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from './entities/feature-flag.entity';
import { isKnownFlag, KNOWN_FLAGS } from './feature-flags.constants';

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagRepo: Repository<FeatureFlag>,
  ) {}

  /** Every known flag with its effective state for this org (override ?? default). */
  async list(orgId: string) {
    const rows = await this.flagRepo.find({
      where: { organizationId: orgId },
    });
    const overrides = new Map(rows.map((r) => [r.key, r.enabled]));
    return Object.values(KNOWN_FLAGS).map((def) => ({
      key: def.key,
      description: def.description,
      enabled: overrides.has(def.key) ? overrides.get(def.key) : def.default,
      isDefault: !overrides.has(def.key),
    }));
  }

  /** Is a feature enabled for an org? (override ?? catalogue default). */
  async isEnabled(orgId: string, key: string): Promise<boolean> {
    const row = await this.flagRepo.findOne({
      where: { organizationId: orgId, key },
    });
    if (row) return row.enabled;
    return KNOWN_FLAGS[key]?.default ?? false;
  }

  /** Set/override a flag (upsert). Rejects unknown flag keys. */
  async set(orgId: string, key: string, enabled: boolean) {
    if (!isKnownFlag(key)) {
      throw new NotFoundException(`Unknown feature flag "${key}"`);
    }
    let row = await this.flagRepo.findOne({
      where: { organizationId: orgId, key },
    });
    if (row) {
      row.enabled = enabled;
    } else {
      row = this.flagRepo.create({ organizationId: orgId, key, enabled });
    }
    await this.flagRepo.save(row);
    return { key, enabled };
  }
}

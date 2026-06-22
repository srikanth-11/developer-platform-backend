import { Column, Entity, Index, Unique } from 'typeorm';
import { AbstractBaseEntity } from '../../common/entities/base.entity';

/**
 * FeatureFlag — a per-organization on/off override for a feature
 * (table: `feature_flags`). Only flags that DIFFER from the default need a row;
 * unset flags use the default from the catalogue.
 */
@Entity('feature_flags')
@Unique(['organizationId', 'key'])
export class FeatureFlag extends AbstractBaseEntity {
  @Index()
  @Column()
  organizationId: string;

  @Column()
  key: string;

  @Column()
  enabled: boolean;
}

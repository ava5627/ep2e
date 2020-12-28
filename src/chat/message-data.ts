import type { AreaEffect } from '@src/combat/attack-formatting';
import type { ExplosiveTrigger } from '@src/data-enums';
import type { ItemType } from '@src/entities/entity-types';
import type { SubstanceUseMethod } from '@src/entities/item/proxies/substance';
import type { ItemEntity } from '@src/entities/models';
import type { ArmorType } from '@src/features/active-armor';
import type { PlacedTemplateIDs } from '@src/foundry/canvas';
import type { RolledFormula } from '@src/foundry/rolls';
import type { HealthModification, HealthType } from '@src/health/health';
import type { RollMultiplier } from '@src/health/health-changes';
import type { StressType } from '@src/health/mental-health';
import type { RequireAtLeastOne } from 'type-fest';

export type StressTestMessageData = {
  rolledFormulas: RolledFormula[];
  minStress: '' | 'half' | number;
  stressType: StressType | '';
  notes?: string;
  source?: string;
};

export type DamageMessageData = {
  rolledFormulas: RolledFormula[];
  damageType: HealthType;
  source: string;
  armorPiercing?: boolean;
  reduceAVbyDV?: boolean;
  armorUsed?: ArmorType[];
  cumulativeDotID?: string;
  multiplier?: RollMultiplier;
  areaEffect?: AreaEffect;
};

export type MessageHealData = RequireAtLeastOne<
  {
    source: string;
    damageFormulas?: RolledFormula[];
    wounds?: number;
    healthType: HealthType;
  },
  'damageFormulas' | 'wounds'
>;

export type HealthChangeMessageData = HealthModification & {
  healthType: HealthType;
  killing?: boolean;
  biological?: boolean;
  reducedArmor?: Partial<Record<ArmorType, number>>;
};

export type SubstanceUseData = {
  substance: ItemEntity<ItemType.Substance>;
  useMethod: SubstanceUseMethod;
  doses?: number;
  appliedTo?: string[];
  hidden?: boolean;
};

export type ExplosiveSettings = {
  template?: PlacedTemplateIDs | null;
  trigger: ExplosiveTrigger;
  timerDuration?: number;
  duration?: number;
  attackType?: 'primary' | 'secondary';
  centeredReduction?: number;
  uniformBlastRadius?: number;
};

export type UsedExplosiveState = ['detonated' | 'reclaimed', string];

export type ExplosiveMessageData = ExplosiveSettings & {
  explosive: ItemEntity<ItemType.Explosive>;
  state?: null | UsedExplosiveState;
};

export type MessageHeaderData = {
  heading: string;
  subheadings?: string | string[];
  img?: string;
  description?: string;
  hidden?: boolean;
};

export type MessageData = Partial<{
  header: MessageHeaderData;
  stress: StressTestMessageData;
  damage: DamageMessageData;
  healthChange: HealthChangeMessageData;
  explosiveUse: ExplosiveMessageData;
  heal: MessageHealData;
  substanceUse: SubstanceUseData;
  fromMessageId: string;
}>;

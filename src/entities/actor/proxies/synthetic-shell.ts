import {
  AppliedEffects,
  ReadonlyAppliedEffects,
} from '@src/entities/applied-effects';
import { ActorType, ItemType } from '@src/entities/entity-types';
import type { EquippableItem, ItemProxy } from '@src/entities/item/item';
import type { PhysicalTech } from '@src/entities/item/proxies/physical-tech';
import type { Software } from '@src/entities/item/proxies/software';
import type { Trait } from '@src/entities/item/proxies/trait';
import { EffectType } from '@src/features/effects';
import { notify, NotificationType } from '@src/foundry/foundry-apps';
import { format, localize } from '@src/foundry/localization';
import { HealthType } from '@src/health/health';
import { MeshHealth } from '@src/health/full-mesh-health';
import { SyntheticHealth } from '@src/health/synthetic-health';
import { LazyGetter } from 'lazy-get-decorator';
import { ActorProxyBase, ActorProxyInit } from './actor-proxy-base';
import { AppMeshHealth } from '@src/health/app-mesh-health';

export class SyntheticShell extends ActorProxyBase<ActorType.SyntheticShell> {
  private _localEffects?: AppliedEffects;
  private _outsideEffects?: ReadonlyAppliedEffects;
  readonly sleeved;

  constructor({
    activeEffects,
    sleeved,
    ...init
  }: ActorProxyInit<ActorType.SyntheticShell> & {
    activeEffects?: ReadonlyAppliedEffects;
    sleeved?: boolean;
  }) {
    super(init);
    if (activeEffects) this._outsideEffects = activeEffects;

    this.sleeved = sleeved;
  }

  get pools() {
    return this.epData.pools;
  }

  get subtype() {
    return this.epData.subtype;
  }

  get activeEffects() {
    return this._outsideEffects ?? this.itemGroups.effects;
  }

  get nonDefaultBrain() {
    const { brain } = this.epData;
    return brain ? this.availableBrains.get(brain) : null;
  }

  @LazyGetter()
  get availableBrains() {
    const things = new Map<string, PhysicalTech>();
    for (const proxy of this.items.values()) {
      if (proxy.type === ItemType.PhysicalTech && proxy.isBrain) {
        things.set(proxy.id, proxy);
      }
    }
    return things;
  }

  get isSwarm() {
    return this.epData.isSwarm;
  }

  get movementRates() {
    return this.epData.movementRates;
  }

  get reachBonus() {
    return this.isSwarm ? 0 : this.epData.reach;
  }

  get prehensileLimbs() {
    return this.epData.prehensileLimbs;
  }

  @LazyGetter()
  get physicalHealth() {
    return new SyntheticHealth({
      data: this.epData.physicalHealth,
      statMods: this.activeEffects.getHealthStatMods(HealthType.Physical),
      updater: this.updater.prop('data', 'physicalHealth').nestedStore(),
      source: this.epData.inherentArmor.source || localize('frame'),
      isSwarm: this.isSwarm,
      recovery: this.activeEffects.getGroup(EffectType.HealthRecovery),
    });
  }

  @LazyGetter()
  get meshHealth() {
    return new MeshHealth({
      data: this.epData.meshHealth,
      statMods: this.activeEffects?.getHealthStatMods(HealthType.Mesh),
      updater: this.updater.prop('data', 'meshHealth').nestedStore(),
      source: localize('mindState'),
      homeDevices: 1, // TODO,
      deathRating: true
    });
  }

  @LazyGetter() 
  get firewallHealth() {
    return new AppMeshHealth({
      data: this.epData.firewallHealth,
      updater: this.updater.prop("data", "firewallHealth").nestedStore(),
      source: `${localize("firewall")} (${this.epData.firewallRating})`,
    })
    }

  get activeMeshHealth() {
    const { nonDefaultBrain } = this;
    return nonDefaultBrain ? nonDefaultBrain.meshHealth : this.meshHealth;
  }

  get activeFirewallHealth() {
    const { nonDefaultBrain } = this;
    return nonDefaultBrain ? nonDefaultBrain.firewallHealth : this.firewallHealth;
  }

  addNewItemProxy(proxy: ItemProxy | null | undefined) {
    if (!proxy || this.disabled) return;
    if (this.hasItemProxy(proxy)) {
      return notify(
        NotificationType.Info,
        format('AlreadyHasItem', {
          ownerName: this.name,
          itemName: proxy.name,
        }),
      );
    }

    switch (proxy.type) {
      case ItemType.Trait: {
        if (proxy.isMorphTrait) {
          if (proxy.hasMultipleLevels) {
            proxy.selectLevelAndAdd(this.itemOperations.add);
          } else {
            this.itemOperations.add(proxy.getDataCopy(true));
          }
        } else {
          notify(
            NotificationType.Error,
            localize('DESCRIPTIONS', 'OnlyMorphTraits'),
          );
        }
        break;
      }

      case ItemType.Armor:
      case ItemType.BeamWeapon:
      case ItemType.Firearm:
      case ItemType.MeleeWeapon:
      case ItemType.PhysicalTech:
      case ItemType.Railgun:
      case ItemType.SeekerWeapon: {
        if (proxy.isWare) {
          const copy = proxy.getDataCopy(true);
          copy.data.state.equipped = true;
          this.itemOperations.add(copy);
        } else {
          notify(
            NotificationType.Error,
            localize('DESCRIPTIONS', 'OnlyWareItems'),
          );
        }
        break;
      }

      case ItemType.Software: {
        const copy = proxy.getDataCopy(true);
        copy.data.state.equipped = true;
        this.itemOperations.add(copy);
        break;
      }

      default:
        notify(
          NotificationType.Error,
          localize('DESCRIPTIONS', 'OnlyPhysicalMorphItems'),
        );
        break;
    }
  }

  @LazyGetter()
  get itemGroups() {
    const traits: Trait[] = [];
    const ware: EquippableItem[] = [];
    const software: Software[] = [];
    const effects = new AppliedEffects();
    for (const proxy of this.items.values()) {
      switch (proxy.type) {
        case ItemType.Trait:
          traits.push(proxy);
          effects.add(proxy.currentEffects);
          break;

        case ItemType.Armor:
        case ItemType.BeamWeapon:
        case ItemType.Firearm:
        case ItemType.MeleeWeapon:
        case ItemType.PhysicalTech:
        case ItemType.Railgun:
        case ItemType.SeekerWeapon: {
          ware.push(proxy);
          if ('currentEffects' in proxy) {
            effects.add(proxy.currentEffects);
          }
          break;
        }

        case ItemType.Software: {
          software.push(proxy);
          effects.add(proxy.currentEffects);
        }

        default:
          break;
      }
    }
    return { traits, ware, effects, software };
  }
}

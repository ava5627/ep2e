import { createMessage } from '@src/chat/create-message';
import type { MessageHeaderData } from '@src/chat/message-data';
import {
  createBaseAttackFormula,
  SubstanceAttack,
  SubstanceAttackData,
} from '@src/combat/attacks';
import {
  closeWindow,
  openOrRenderWindow,
} from '@src/components/window/window-controls';
import {
  ResizeOption,
  SlWindowEventName,
} from '@src/components/window/window-options';
import {
  SubstanceApplicationMethod,
  SubstanceClassification,
  SubstanceType,
} from '@src/data-enums';
import type { AddEffects } from '@src/entities/applied-effects';
import { ItemType } from '@src/entities/entity-types';
import {
  ActiveSubstanceState,
  DrugAppliedItem,
  ItemEntity,
  setupItemOperations,
  SubstanceItemFlags,
} from '@src/entities/models';
import { UpdateStore } from '@src/entities/update-store';
import type { Effect } from '@src/features/effects';
import {
  addFeature,
  StringID,
  stringID,
  uniqueStringID,
} from '@src/features/feature-helpers';
import { toMilliseconds } from '@src/features/modify-milliseconds';
import { createLiveTimeState, currentWorldTimeMS } from '@src/features/time';
import { localize } from '@src/foundry/localization';
import { EP } from '@src/foundry/system';
import { notEmpty } from '@src/utility/helpers';
import { LazyGetter } from 'lazy-get-decorator';
import mix from 'mix-with/lib';
import { createPipe, last, map, merge, pipe, uniq } from 'remeda';
import type { Attacker } from '../item-interfaces';
import { Copyable, Purchasable, Stackable } from '../item-mixins';
import { renderItemForm } from '../item-views';
import { ItemProxyBase, ItemProxyInit } from './item-proxy-base';
import { Sleight } from './sleight';
import { Trait } from './trait';

export type SubstanceUseMethod = Substance['applicationMethods'][number];

class Base extends ItemProxyBase<ItemType.Substance> {
  get updateState() {
    return this.updater.prop('data', 'state');
  }
  get updateQuantity() {
    return this.updater.prop('data');
  }
}
export class Substance
  extends mix(Base).with(Purchasable, Copyable, Stackable)
  implements Attacker<SubstanceAttackData, SubstanceAttack> {
  static onsetTime(application: SubstanceUseMethod) {
    switch (application) {
      case SubstanceApplicationMethod.Inhalation:
        return toMilliseconds({ seconds: 3 });

      case SubstanceApplicationMethod.Dermal:
      case SubstanceApplicationMethod.Injected:
        return toMilliseconds({ seconds: 6 });

      case SubstanceApplicationMethod.Oral:
        return toMilliseconds({ minutes: 15 });

      case 'use':
      case 'app':
        return 0;
    }
  }
  private static appliedItemWindows = new WeakMap<object, Map<string, {}>>();

  readonly loaded;
  readonly appliedState: '' | 'awaitingOnset' | 'active';

  constructor({
    loaded,
    ...init
  }: ItemProxyInit<ItemType.Substance> & {
    loaded: boolean;
  }) {
    super(init);
    this.loaded = loaded;
    this.appliedState = this.epFlags?.awaitingOnset
      ? 'awaitingOnset'
      : this.epFlags?.active
      ? 'active'
      : '';

    if (this.appliedState) {
      const { itemWindowKeys } = this;
      if (notEmpty(itemWindowKeys)) {
        const { alwaysAppliedItems, severityAppliedItems } = this;
        for (const stringID of itemWindowKeys.keys()) {
          const [namespace, id] = stringID.split('___');
          const group =
            namespace === 'always' ? alwaysAppliedItems : severityAppliedItems;
          const item = id && group.get(id);
          item && item.openForm?.();
        }
      }
    }
  }

  get appliedName() {
    if (this.appliedAndHidden) {
      return game.user.isGM ? `??? {${this.name}}` : '???';
    }
    return this.name;
  }

  get appliedAndHidden() {
    return !!(this.appliedState && this.epFlags?.[this.appliedState]?.hidden);
  }

  private get itemWindowKeys() {
    return Substance.appliedItemWindows.get(this.updater);
  }

  private getItemWindowKey(group: 'always' | 'severity', id: string) {
    let { itemWindowKeys } = this;
    if (!itemWindowKeys) {
      itemWindowKeys = new Map();
      Substance.appliedItemWindows.set(this.updater, itemWindowKeys);
    }
    const fullID = `${group}___${id}`;
    let key = itemWindowKeys.get(fullID);
    if (!key) {
      key = {};
      itemWindowKeys.set(fullID, key);
    }
    return key;
  }

  @LazyGetter()
  get awaitingOnsetTimeState() {
    const { awaitingOnset } = this.epFlags || {};
    // TODO Think of something better than throwing error, returning null is weird here
    if (!awaitingOnset) throw new Error('Substance is not awaiting onset');
    return createLiveTimeState({
      img: this.nonDefaultImg,
      id: `awaiting-onset-${this.id}`,
      duration: Substance.onsetTime(awaitingOnset.useMethod),
      startTime: awaitingOnset.onsetStartTime,
      label: this.appliedName,
      updateStartTime: this.updater.prop(
        'flags',
        EP.Name,
        'awaitingOnset',
        'onsetStartTime',
      ).commit,
    });
  }

  get applicationMethods(): ('app' | 'use' | SubstanceApplicationMethod)[] {
    return this.isChemical
      ? ['use']
      : this.isElectronic
      ? ['app']
      : this.epData.application;
  }

  get fullName() {
    return `${this.name} (${this.quantity})`;
  }

  get fullType() {
    return uniq([
      this.category,
      ...map([this.classification, this.substanceType], localize),
    ]).join(' ');
  }

  get partialType() {
    return pipe(
      [this.classification, this.substanceType],
      uniq(),
      map(localize),
    ).join(' ');
  }

  get category() {
    return this.epData.category;
  }

  get isAddictive() {
    return !!this.epData.addiction;
  }

  get substanceType() {
    return this.epData.substanceType;
  }

  get isDrug() {
    return this.substanceType === SubstanceType.Drug;
  }

  get isToxin() {
    return this.substanceType === SubstanceType.Toxin;
  }

  get isChemical() {
    return this.substanceType === SubstanceType.Chemical;
  }

  get classification() {
    return this.isChemical
      ? SubstanceType.Chemical
      : this.epData.classification;
  }

  get isElectronic() {
    return (
      !this.isChemical &&
      this.classification === SubstanceClassification.Electronic
    );
  }

  get alwaysApplied() {
    return {
      ...this.epData.alwaysApplied,
      damage: this.attacks.primary,
      items: this.alwaysAppliedItems,
      get hasInstantDamage(): boolean {
        return notEmpty(this.damage.rollFormulas) && !this.damage.perTurn;
      },
      get hasEffects(): boolean {
        return notEmpty(this.items) || notEmpty(this.effects);
      },
      get viable(): boolean {
        return this.hasEffects || notEmpty(this.damage.rollFormulas);
      },
    };
  }

  get severity() {
    return {
      ...this.epData.severity,
      damage: this.setupAttack(
        this.epData.severity.damage,
        localize('severity'),
      ),
      items: this.severityAppliedItems,
      get hasInstantDamage(): boolean {
        return notEmpty(this.damage.rollFormulas) && !this.damage.perTurn;
      },
      get hasEffects(): boolean {
        return (
          notEmpty(this.items) ||
          notEmpty(this.effects) ||
          notEmpty(this.conditions)
        );
      },
      get viable(): boolean {
        return this.hasEffects || notEmpty(this.damage.rollFormulas);
      },
    };
  }

  @LazyGetter()
  get attacks() {
    return {
      primary: this.setupAttack(
        this.epData.alwaysApplied.damage,
        localize('alwaysApplied'),
      ),
      secondary: this.hasSeverity
        ? this.setupAttack(this.epData.severity.damage, localize('severity'))
        : null,
    };
  }

  setupAttack(
    { damageFormula, ...data }: SubstanceAttackData,
    defaultLabel: string,
  ): SubstanceAttack {
    return {
      ...data,
      label: this.hasSeverity ? defaultLabel : '',
      rollFormulas: damageFormula
        ? [createBaseAttackFormula(damageFormula)]
        : [],
    };
  }

  @LazyGetter()
  get alwaysAppliedItems() {
    return this.getInstancedItems('alwaysAppliedItems');
  }

  @LazyGetter()
  get severityAppliedItems() {
    return this.getInstancedItems('severityAppliedItems');
  }

  get hasSeverity() {
    return this.epData.hasSeverity;
  }

  get consumeOnUse() {
    return this.epData.consumeOnUse;
  }

  private getInstancedItems(
    group: 'alwaysAppliedItems' | 'severityAppliedItems',
  ) {
    const items = new Map<string, Trait | Sleight>();
    const ops = setupItemOperations((datas) =>
      this.updater
        .prop('flags', EP.Name, group)
        .commit((items) => datas(items || []) as typeof items),
    );

    const proxyInit = (
      data: ItemEntity<ItemType.Trait> | ItemEntity<ItemType.Sleight>,
    ) => {
      const init = {
        embedded: this.name,
        lockSource: false,
        alwaysDeletable: !this.appliedState && this.editable,
        temporary: this.appliedState ? this.appliedName : '',
        deleteSelf: this.appliedState ? undefined : () => ops.remove(data._id),
      };
      // TODO clean this up to avoid duplication
      if (data.type === ItemType.Trait) {
        const trait: Trait = new Trait({
          ...init,
          data,
          updater: new UpdateStore({
            getData: () => data,
            isEditable: () => this.editable,
            setData: createPipe(merge({ _id: data._id }), ops.update),
          }),
          openForm: this.appliedState
            ? () => {
                const { win, windowExisted } = openOrRenderWindow({
                  key: this.getItemWindowKey(
                    group === 'alwaysAppliedItems' ? 'always' : 'severity',
                    data._id,
                  ),
                  content: renderItemForm(trait),
                  resizable: ResizeOption.Vertical,
                  name: trait.fullName,
                });
                if (!windowExisted) {
                  win.addEventListener(
                    SlWindowEventName.Closed,
                    () => {
                      this.itemWindowKeys?.delete(
                        `${
                          group === 'alwaysAppliedItems' ? 'always' : 'severity'
                        }___${data._id}`,
                      );
                    },
                    { once: true },
                  );
                }
              }
            : undefined,
        });
        return trait;
      }
      const sleight: Sleight = new Sleight({
        ...init,
        data,
        updater: new UpdateStore({
          getData: () => data,
          isEditable: () => this.editable,
          setData: createPipe(merge({ _id: data._id }), ops.update),
        }),
        openForm: this.appliedState
          ? () => {
              const { win, windowExisted } = openOrRenderWindow({
                key: this.getItemWindowKey(
                  group === 'alwaysAppliedItems' ? 'always' : 'severity',
                  data._id,
                ),
                content: renderItemForm(sleight),
                resizable: ResizeOption.Vertical,
                name: sleight.fullName,
              });
              if (!windowExisted) {
                win.addEventListener(
                  SlWindowEventName.Closed,
                  () => {
                    this.itemWindowKeys?.delete(
                      `${
                        group === 'alwaysAppliedItems' ? 'always' : 'severity'
                      }___${data._id}`,
                    );
                  },
                  { once: true },
                );
              }
            }
          : undefined,
      });
      return sleight;
    };

    for (const itemData of this.epFlags?.[group] || []) {
      items.set(itemData._id, proxyInit(itemData));
    }
    return items;
  }

  addItemEffect(group: keyof SubstanceItemFlags, itemData: DrugAppliedItem) {
    this.updater.prop('flags', EP.Name, group).commit((items) => {
      const changed = [...(items || [])];
      const _id = uniqueStringID(
        changed.map((i) => last(i._id.split('-')) || i._id),
      );
      return [
        ...changed,
        {
          ...itemData,
          _id: `${this.id}-${
            group === 'alwaysAppliedItems' ? 'always' : 'severity'
          }-${_id}`,
        },
      ] as typeof changed;
    });
  }

  get messageHeader(): MessageHeaderData {
    return {
      heading: this.name,
      img: this.nonDefaultImg,
      subheadings: this.fullType,
      description: this.description,
    };
  }

  async createMessage({
    method,
    hidden = false,
  }: {
    method: SubstanceUseMethod;
    hidden?: boolean;
  }) {
    await createMessage({
      data: {
        header: { ...this.messageHeader, hidden },
        substanceUse: {
          substance: this.getDataCopy(),
          useMethod: method,
          hidden,
        },
      },
      entity: this.actor,
    });
    await this.use();
    return;
  }

  use() {
    if (this.consumeOnUse && this.editable) return this.consumeUnit();
    return;
  }

  updateAppliedState(newState: ActiveSubstanceState) {
    return this.updater.prop('flags', EP.Name, 'active').commit(newState);
  }

  createAwaitingOnset({
    method,
    hidden = false,
  }: {
    method: SubstanceUseMethod;
    hidden?: boolean;
  }) {
    const copy = this.getDataCopy();
    const {
      awaitingOnset,
      active: active,
      alwaysAppliedItems,
      severityAppliedItems,
      ...more
    } = copy.flags[EP.Name] || {};
    copy.flags = {
      ...copy.flags,
      [EP.Name]: {
        ...more,
        alwaysAppliedItems: alwaysAppliedItems?.map((i) => ({
          ...i,
          _id: `${stringID()}-${this.id}-always-${i._id}`,
        })),
        severityAppliedItems: severityAppliedItems?.map((i) => ({
          ...i,
          _id: `${stringID()}-${this.id}-severity-${i._id}`,
        })),
        awaitingOnset: {
          useMethod: method,
          onsetStartTime: currentWorldTimeMS(),
          hidden,
        },
      },
    };
    copy.data.quantity = 1;
    return copy;
  }

  makeActive(modifyingEffects: Effect[]) {
    const hidden = this.epFlags?.awaitingOnset?.hidden ?? false;
    const state: ActiveSubstanceState = {
      modifyingEffects: modifyingEffects.reduce(
        (accum, effect) => addFeature(accum, effect),
        [] as StringID<Effect>[],
      ),
      applySeverity: false,
      hidden,
      startTime: currentWorldTimeMS(),
      finishedEffects: [],
    };

    return this.updater
      .prop('flags', EP.Name, 'awaitingOnset')
      .store(null)
      .prop('flags', EP.Name, 'active')
      .commit(state);
  }

  onDelete() {
    this.itemWindowKeys?.forEach(closeWindow);
    Substance.appliedItemWindows.delete(this.updater);
    super.onDelete();
  }

  @LazyGetter()
  get appliedInfo() {
    const { active: active } = this.epFlags ?? {};
    const effects: AddEffects[] = [];
    const items: (Trait | Sleight)[] = [];
    // TODO Damage/Conditions and apply effects to effects/duration
    const { alwaysApplied, severity, hasSeverity } = this;
    let duration = alwaysApplied.duration;

    if (!active?.finishedEffects?.includes('always')) {
      effects.push({
        source: this.appliedName,
        effects: alwaysApplied.effects,
      });
      items.push(...alwaysApplied.items.values());
    }
    if (
      hasSeverity &&
      active?.applySeverity &&
      !active.finishedEffects?.includes('severity')
    ) {
      effects.push({
        source: `${this.appliedName} (${localize('severity')})`,
        effects: severity.effects,
      });
      items.push(...severity.items.values());
      if (severity.duration > duration) duration = severity.duration;
    }
    return {
      effects,
      items,
      timeState: createLiveTimeState({
        id: `active-${this.id}`,
        img: this.nonDefaultImg,
        label: this.appliedName,
        duration,
        startTime: active?.startTime || currentWorldTimeMS() - duration,
        updateStartTime: this.updater.prop(
          'flags',
          EP.Name,
          'active',
          'startTime',
        ).commit,
      }),
    };
  }
}

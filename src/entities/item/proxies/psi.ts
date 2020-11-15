import type { ItemType } from '@src/entities/entity-types';
import { UpdateStore } from '@src/entities/update-store';
import { StringID, updateFeature } from '@src/features/feature-helpers';
import {
  createDefaultPsiInfluences,
  InfluenceRoll,
  PsiInfluence,
  PsiInfluenceData,
  PsiInfluenceType,
  TraitInfluenceData,
} from '@src/features/psi-influence';
import { localize } from '@src/foundry/localization';
import { EP } from '@src/foundry/system';
import { LazyGetter } from 'lazy-get-decorator';
import { clamp, mapToObj } from 'remeda';
import { ItemProxyBase } from './item-proxy-base';
import { Trait } from './trait';

export class Psi extends ItemProxyBase<ItemType.Psi> {
  @LazyGetter()
  get fullInfluences() {
    const data = this.influencesData || createDefaultPsiInfluences()
    return mapToObj<StringID<PsiInfluenceData>, InfluenceRoll, StringID<PsiInfluence>>(
     data,
      (influence) => {
        if (influence.type === PsiInfluenceType.Trait) {
          return [
            influence.roll,
            {
              ...influence,
              trait: new Trait({
                data: influence.trait,
                embedded: this.name,
                lockSource: true,
              }),
            },
          ];
        }
        return [influence.roll, influence];
      },
    );
    // return new Map<InfluenceRoll, PsiInfluence>(
    //   (this.epFlags?.influences || []).map((influence) => {
    //     if (influence.type === PsiInfluenceType.Trait) {
    //       return [
    //         influence.roll,
    //         {
    //           ...influence,
    //           trait: new Trait({
    //             data: influence.trait,
    //             embedded: this.name,
    //             lockSource: true,
    //           }),
    //         },
    //       ] as const;
    //     }
    //     return [influence.roll, influence] as const;
    //   }),
    // );
  }

  get strain() {
    return this.epData.strain
  }

  get influencesData() {
    return this.epFlags?.influences;
  }

  get state() {
    return this.epData.state;
  }

  get receded() {
    return this.state.receded;
  }

  get checkoutTime() {
    return this.state.checkoutTime;
  }

  get interference() {
    return this.state.interference;
  }

  get infectionRating() {
    return clamp(this.state.infectionRating, this.infectionClamp);
  }

  get baseInfectionRating() {
    return this.level * 10;
  }

  get hasVariableInfection() {
    return this.level !== 3;
  }

  get freePush() {
    return this.level === 2 ? this.state.freePush : '';
  }

  get hasChiIncreasedEffect() {
    return this.hasVariableInfection && this.infectionRating >= 33;
  }

  get hasFreePushEffect() {
    return this.level === 2 && this.infectionRating >= 66;
  }

  get activeFreePush() {
    return this.hasFreePushEffect ? this.freePush : '';
  }

  get infectionClamp() {
    return { min: this.baseInfectionRating, max: 99 };
  }

  get level() {
    return this.epData.level;
  }

  updateFreePush(push: Psi['freePush']) {
    return this.updater.prop('data', 'state', 'freePush').commit(push);
  }

  updateLevel(newLevel: 1 | 2 | 3) {
    this.updater
      .prop('data', 'level')
      .store(newLevel)
      .prop('data', 'state', 'infectionRating')
      .commit((rating) => clamp(rating, { min: newLevel * 10 }));
  }

  updateInfectionRating(newRating: number) {
    return this.updater
      .prop('data', 'state', 'infectionRating')
      .commit(newRating);
  }

  getDataCopy(reset = false) {
    const copy = super.getDataCopy(reset);
    if (reset) {
      copy.data.state.infectionRating = this.baseInfectionRating;
    }
    return copy;
  }

  storeInfectionChange(change: number) {
    const newRating = clamp(this.infectionRating + change, {
      min: this.baseInfectionRating,
      max: 99,
    });
    this.updater.prop('data', 'state', 'infectionRating').store(newRating);
    return newRating;
  }

  getTrait(influence: StringID<TraitInfluenceData>) {
    return new Trait({
      data: influence.trait,
      lockSource: true,
      embedded: `${this.name} ${localize('influence')}`,
      updater: new UpdateStore({
        getData: () => influence.trait,
        isEditable: () => this.editable,
        setData: (update) => {
          this.updater.prop('flags', EP.Name, 'influences').commit((list) =>
            updateFeature(list || [], {
              id: influence.id,
              trait: mergeObject(influence.trait, update, { inplace: false }),
            }),
          );
        },
      }),
    });
  }

  setupDefaultInfluences() {
    return this.updater.prop("flags", EP.Name, "influences").commit(createDefaultPsiInfluences())
  }
}

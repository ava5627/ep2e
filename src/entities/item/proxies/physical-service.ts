import { PhysicalServiceType } from '@src/data-enums';
import type { ItemType } from '@src/entities/entity-types';
import { matchID, updateFeature } from '@src/features/feature-helpers';
import {
  repRefreshTimerActive,
  RepUse,
  repModification,
} from '@src/features/reputations';
import {
  RefreshTimer,
  CommonInterval,
  refreshAvailable,
  getElapsedTime,
  currentWorldTimeMS,
  createRefreshTimer,
} from '@src/features/time';
import { localize } from '@src/foundry/localization';
import { nonNegative, toggle } from '@src/utility/helpers';
import { LazyGetter } from 'lazy-get-decorator';
import mix from 'mix-with/lib';
import { createPipe, map, merge, objOf, set } from 'remeda';
import { Purchasable, Service } from '../item-mixins';
import { ItemProxyBase, ItemProxyInit } from './item-proxy-base';

class Base extends ItemProxyBase<ItemType.PhysicalService> {}
export class PhysicalService extends mix(Base).with(Purchasable, Service) {
  constructor(init: ItemProxyInit<ItemType.PhysicalService>) {
    super(init);
  }

  get serviceType() {
    return this.epData.serviceType;
  }

  get isFakeEgoId() {
    return this.serviceType === PhysicalServiceType.FakeId;
  }

  get reputations() {
    return this.epData.reputations;
  }

  get hasActiveRepRefreshTimers() {
    return this.reputations.some(repRefreshTimerActive);
  }

  get equipped() {
    return this.epData.state.equipped;
  }

  findRep(id: string) {
    return this.reputations.find(matchID(id));
  }

  toggleEquipped() {
    return this.updater
      .prop('data', 'state')
      .commit(({ equipped, serviceStartTime }) => ({
        equipped: !equipped,
        serviceStartTime: equipped ? serviceStartTime : currentWorldTimeMS(),
      }));
  }

  useRep({ id, ...use }: RepUse & { id: string }) {
    const rep = this.findRep(id);
    if (!rep) return;
    return this.updater.prop('data', 'reputations').commit((reps) =>
      updateFeature(reps, {
        id,
        ...repModification({ rep, ...use }),
      }),
    );
  }

  @LazyGetter()
  get repsWithIndefiers() {
    return this.reputations.map((rep) => ({
      ...rep,
      identifier: { repId: rep.id, fakeEgoId: this.id },
    }));
  }

  get refreshTimers(): RefreshTimer[] {
    return this.reputations.flatMap((rep) => {
      return repRefreshTimerActive(rep)
        ? createRefreshTimer({
            label: `${this.name} - ${localize('fakeId')} | ${
              rep.acronym
            } ${localize('favor')} ${localize('refresh')}`,
            max: CommonInterval.Week,
            id: `${this.id}-${rep.id}`,
            startTime: rep.refreshStartTime,
            updateStartTime: (refreshStartTime) => {
              this.updater.prop('data', 'reputations').commit((reps) =>
                updateFeature(reps, {
                  refreshStartTime: refreshStartTime,
                  id: rep.id,
                }),
              );
            },
          })
        : [];
    });
  }

  storeRepRefresh() {
    if (this.refreshTimers.some(refreshAvailable)) {
      this.updater
        .prop('data', 'reputations')
        .store(
          map((rep) =>
            getElapsedTime(rep.refreshStartTime) >= CommonInterval.Week
              ? { ...rep, refreshStartTime: 0, minor: 0, moderate: 0 }
              : rep,
          ),
        );
    }
    return this.updater;
  }

  getDataCopy(reset = false) {
    const copy = super.getDataCopy(reset);
    if (reset) {
      copy.data.state = {
        equipped: false,
        serviceStartTime: currentWorldTimeMS(),
      };
      copy.data.reputations.forEach(
        set('refreshStartTime', currentWorldTimeMS()),
      );
    }
    return copy;
  }
}

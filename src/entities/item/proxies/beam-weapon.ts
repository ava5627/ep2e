import type { ItemType } from '@src/entities/entity-types';
import mix from 'mix-with/lib';
import { Equippable, Gear, Purchasable } from '../item-mixins';
import { ItemProxyBase, ItemProxyInit } from './item-proxy-base';

class Base extends ItemProxyBase<ItemType.BeamWeapon> {}
export class BeamWeapon extends mix(Base).with(Gear, Purchasable, Equippable) {
  constructor(init: ItemProxyInit<ItemType.BeamWeapon>) {
    super(init)
  }
}

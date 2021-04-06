import { enumValues, PoolType, PsiPush, PsiRange } from '@src/data-enums';
import { ActorType } from '@src/entities/entity-types';
import type { Sleight } from '@src/entities/item/proxies/sleight';
import { Action, ActionSubtype, createAction } from '@src/features/actions';
import { matchesSkill, Source } from '@src/features/effects';
import { Pool } from '@src/features/pool';
import type { Skill } from '@src/features/skills';
import { localize } from '@src/foundry/localization';
import { distanceBetweenTokens } from '@src/foundry/token-helpers';
import { notEmpty } from '@src/utility/helpers';
import type { WithUpdate } from '@src/utility/updating';
import { compact, concat, difference, merge, pipe, take, uniq } from 'remeda';
import type { SetRequired } from 'type-fest';
import { psiRangeThresholds } from './range-modifiers';
import { SkillTest, SkillTestInit } from './skill-test';
import {
  createSuccessTestModifier,
  successTestEffectMap,
} from './success-test';

export type PsiTestInit = SetRequired<SkillTestInit, 'character'> & {
  sleight: Sleight;
};

export class PsiTest extends SkillTest {
  readonly character;

  readonly use: WithUpdate<{
    sleight: Sleight;
    push: '' | PsiPush;
    attackTargets: Set<Token>;
    targetDistance: number;
    targetingAsync: boolean;
    maxTargets: number;
    targetingSelf: boolean;
    range: PsiRange;
    touch: boolean;
    pushPools: number;
  }>;

  readonly rangeModifier = createSuccessTestModifier({
    name: `${localize('range')}: ${localize(PsiRange.Close)}`,
    value: 0,
  });

  constructor({ sleight, ...init }: PsiTestInit) {
    super({
      ...init,
      action:
        init.action ??
        createAction({
          type: sleight.action,
          subtype: ActionSubtype.Mental,
        }),
    });
    this.character = init.character;
    const freePush = this.psi?.freePush;
    const maxTargets = freePush === PsiPush.ExtraTarget ? 2 : 1;
    const attackTargets = new Set(take([...game.user.targets], maxTargets));
    const { token } = this;
    const targettingSelf = !!token && attackTargets.has(token);
    const targetDistance =
      token && notEmpty(attackTargets)
        ? Math.max(
            ...[...attackTargets].map((target) =>
              distanceBetweenTokens(token, target),
            ),
          )
        : 10;

    const extraTargets = freePush === PsiPush.IncreasedRange ? 1 : 0;

    this.use = {
      sleight,
      push: '',
      maxTargets,
      attackTargets,
      targetingSelf: targettingSelf,
      targetDistance,
      touch: false,
      range: PsiRange.Close,
      targetingAsync: false,
      pushPools: 0,
      update: this.recipe((draft, changed) => {
        const currentPoolUse = draft.use.pushPools;
        draft.use = merge(draft.use, changed);
        const { use } = draft;
        if (changed.sleight) {
          this.updateAction(draft, { type: use.sleight.action });
          if (
            use.sleight.isTemporary &&
            use.push === PsiPush.IncreasedDuration
          ) {
            use.push = '';
          }
        }

        if (!use.push) use.pushPools = 0;

        if (use.pushPools !== currentPoolUse) {
          draft.pools.available = this.getPools(this.skillState.skill).map(
            (pool) =>
              pool.type === PoolType.Flex
                ? pool
                : new Pool({
                    type: pool.type,
                    spent: pool.spent + draft.use.pushPools,
                    initialValue: pool.max,
                  }),
          );
        }

        for (const attackTarget of draft.use.attackTargets) {
          for (const [effect, active] of this.getAttackTargetEffects(
            attackTarget as Token,
            draft.skillState.skill,
            draft.action,
          ) || []) {
            draft.modifiers.effects.set(effect, active);
          }
        }

        if (changed.attackTargets && notEmpty(use.attackTargets) && token) {
          use.targetDistance = Math.max(
            ...[...use.attackTargets].map((target) =>
              distanceBetweenTokens(token, target as Token),
            ),
          );
        }

        draft.modifiers.effects = this.getModifierEffects(
          draft.skillState.skill,
          draft.action,
        );

        use.maxTargets =
          extraTargets + (use.push === PsiPush.ExtraTarget ? 1 : 0);

        if (use.targetingSelf) {
          draft.modifiers.simple.delete(this.rangeModifier.id);
        } else if (use.touch) {
          draft.rangeModifier.name = `${localize('range')}: ${localize(
            PsiRange.Touch,
          )}`;
          draft.rangeModifier.value = 20;

          draft.modifiers.simple.set(
            draft.rangeModifier.id,
            draft.rangeModifier,
          );
        } else {
          const thresholds = psiRangeThresholds(
            (use.targetingAsync ? 1 : 0) +
              ((use.push || freePush) === PsiPush.IncreasedRange ? 1 : 0),
          );
          if (draft.use.targetDistance <= thresholds.pointBlank) {
            draft.rangeModifier.name = `${localize('range')}: ${localize(
              PsiRange.PointBlank,
            )}`;
            draft.rangeModifier.value = 10;
          } else if (use.targetDistance <= thresholds.close) {
            draft.rangeModifier.name = `${localize('range')}: ${localize(
              PsiRange.Close,
            )}`;
            draft.rangeModifier.value = 0;
          } else if (draft.use.targetDistance > thresholds.close) {
            const instances = Math.ceil(
              (draft.use.targetDistance - thresholds.close) / 2,
            );
            draft.rangeModifier.name = `${localize(
              'beyondRange',
            )} x${instances}`;
            draft.rangeModifier.value = instances * -10;
          }

          draft.modifiers.simple.set(
            draft.rangeModifier.id,
            draft.rangeModifier,
          );
        }
      }),
    };

    for (const attackTarget of this.use.attackTargets) {
      for (const [effect, active] of this.getAttackTargetEffects(
        attackTarget,
        this.skillState.skill,
        this.action,
      ) || []) {
        this.modifiers.effects.set(effect, active);
      }
    }

    const thresholds = psiRangeThresholds(
      freePush === PsiPush.IncreasedRange ? 1 : 0,
    );
    if (this.use.targetDistance <= thresholds.pointBlank) {
      this.rangeModifier.name = `${localize('range')}: ${localize(
        PsiRange.PointBlank,
      )}`;
      this.rangeModifier.value = 10;
    } else if (this.use.targetDistance > thresholds.close) {
      const instances = Math.ceil(
        (this.use.targetDistance - thresholds.close) / 2,
      );
      this.rangeModifier.name = `${localize('beyondRange')} x${instances}`;
      this.rangeModifier.value = instances * -10;
    }

    this.modifiers.simple.set(this.rangeModifier.id, this.rangeModifier);

    // this.getPools(this.skillState.skill).map(pool => new Pool({
    //   type: pool.type,
    //   spent: pool.spent + 1
    // }))
  }

  // protected getPools() {
  //   const pools = super.getPools(this.skillState.skill);
  //   if (!this.use) return pools;
  //   return this.use.pushPools
  //     ? pools.map((pool) =>
  //         pool.type === PoolType.Flex
  //           ? pool
  //           : new Pool({
  //               type: pool.type,
  //               spent: pool.spent + this.use.pushPools,
  //               initialValue: pool.max,
  //             }),
  //       )
  //     : pools;
  // }

  get psi() {
    return this.character.psi;
  }

  get freePush() {
    return this.psi?.freePush;
  }

  get availablePushes() {
    return pipe(
      enumValues(PsiPush),
      difference(compact([this.character.psi?.freePush])),
      concat([PsiPush.ExtraTarget]),
      uniq(),
    );
  }

  protected getAttackTargetEffects(
    target: Token,
    skill: Skill,
    action: Action,
  ) {
    if (target.actor?.proxy.type !== ActorType.Character) return null;
    return successTestEffectMap(
      target.actor.proxy.appliedEffects
        .getMatchingSuccessTestEffects(matchesSkill(skill)(action), true)
        .map((effect) => ({
          ...effect,
          [Source]: `{${target.name}} ${effect[Source]}`,
        })),
    );
  }
}

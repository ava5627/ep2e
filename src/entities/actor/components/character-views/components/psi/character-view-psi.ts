import type { Slider } from '@material/mwc-slider';
import { createMessage, MessageVisibility } from '@src/chat/create-message';
import { renderNumberInput } from '@src/components/field/fields';
import { renderAutoForm } from '@src/components/form/forms';
import { UseWorldTime } from '@src/components/mixins/world-time-mixin';
import { enumValues, PsiPush } from '@src/data-enums';
import type { Character } from '@src/entities/actor/proxies/character';
import { ActorType } from '@src/entities/entity-types';
import type { Psi } from '@src/entities/item/proxies/psi';
import { addFeature } from '@src/features/feature-helpers';
import { toMilliseconds } from '@src/features/modify-milliseconds';
import { MotivationStance } from '@src/features/motivations';
import {
  influenceInfo,
  InfluenceRoll,
  influenceRolls,
  PsiInfluenceType,
} from '@src/features/psi-influence';
import { createTemporaryFeature } from '@src/features/temporary';
import {
  CommonInterval,
  EPTimeInterval,
  prettyMilliseconds,
} from '@src/features/time';
import { localize } from '@src/foundry/localization';
import { rollFormula } from '@src/foundry/rolls';
import { tooltip } from '@src/init';
import { openMenu } from '@src/open-menu';
import { InfectionTestControls } from '@src/success-test/components/infection-test-controls/infection-test-controls';
import { notEmpty } from '@src/utility/helpers';
import {
  customElement,
  html,
  LitElement,
  property,
  PropertyValues,
  query,
} from 'lit-element';
import { classMap } from 'lit-html/directives/class-map';
import { repeat } from 'lit-html/directives/repeat';
import mix from 'mix-with/lib';
import { mapToObj, sortBy } from 'remeda';
import { requestCharacter } from '../../character-request-event';
import styles from './character-view-psi.scss';

@customElement('character-view-psi')
export class CharacterViewPsi extends mix(LitElement).with(UseWorldTime) {
  static get is() {
    return 'character-view-psi' as const;
  }

  static get styles() {
    return [styles];
  }

  @property({ attribute: false }) character!: Character;

  @property({ attribute: false }) psi!: Psi;

  @query('mwc-slider') private slider?: Slider;

  private resizeObs: ResizeObserver | null = null;

  connectedCallback() {
    this.resizeObs = new ResizeObserver(() => this.layoutSlider());
    this.resizeObs.observe(this);
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    super.disconnectedCallback();
  }

  updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    requestAnimationFrame(() => this.layoutSlider());
  }

  private layoutSlider() {
    this.slider?.layout();
  }

  private startInfectionTest(interference: boolean) {
    const { token } = requestCharacter(this);
    InfectionTestControls.openWindow({
      entities: { actor: this.character.actor, token },
      relativeEl: this,
      getState: (actor) => {
        if (actor.proxy.type === ActorType.Character && actor.proxy.psi) {
          return {
            character: actor.proxy,
            psi: actor.proxy.psi,
            interference,
            token,
          };
        }
        return null;
      },
    });
  }

  private startInterferenceTest() {
    this.startInfectionTest(true);
  }

  openPsiMenu() {
    openMenu({
      content: [
        {
          label: localize('infectionTest'),
          callback: () => this.startInfectionTest(false),
        },
        {
          label: `${localize('roll')} ${localize('influences')}`,
          callback: () => {
            const { token } = requestCharacter(this);

            const roll = rollFormula('1d6');
            if (roll) {
              createMessage({
                entity: token || this.character,
                visibility: MessageVisibility.WhisperGM,
                data: {
                  header: {
                    heading: this.psi.name,
                    subheadings: [`${localize('influence')}`],
                  },
                  influenceRoll: {
                    rollData: roll.toJSON(),
                    influences: mapToObj(influenceRolls, (roll) => {
                      const influence = this.psi.fullInfluences[roll];
                      return [
                        roll,
                        {
                          id: influence.id,
                          name: influenceInfo(influence).name,
                        },
                      ];
                    }),
                  },
                },
              });
            }
          },
        },
      ],
    });
  }

  private openActiveInfluenceMenu(
    ev: MouseEvent & { currentTarget: HTMLElement },
  ) {
    const { roll } = ev.currentTarget.dataset;
    const influenceRoll = Number(roll) as InfluenceRoll;
    const { name } = influenceInfo(this.psi.fullInfluences[influenceRoll]);
    openMenu({
      position: ev,
      header: { heading: name },
      content: [
        {
          label: `${localize('end')} ${localize('influence')}`,
          callback: () => {
            this.psi.deactivateInfluence(influenceRoll);
          },
        },
      ],
    });
  }

  private openFreePushMenu() {
    const { activeFreePush } = this.psi;
    openMenu({
      header: { heading: localize('freePush') },
      content: [
        {
          label: `${localize('no')} ${localize('freePush')}`,
          callback: () => this.psi.updateFreePush(''),
          activated: !activeFreePush,
        },
        ...enumValues(PsiPush).map((push) => ({
          label: localize(push),
          callback: () => this.psi.updateFreePush(push),
          activated: activeFreePush === push,
        })),
      ],
    });
  }

  render() {
    return html`
      <header>
        <button class="name" @click=${this.psi.openForm}>
          ${this.psi.name}
        </button>
        <mwc-icon-button
          @click=${this.openPsiMenu}
          icon="more_vert"
        ></mwc-icon-button>

        <span class="info"
          >${this.psi.strain} ${localize('substrain')} ${localize('level')}
          ${this.psi.level}</span
        >
      </header>

      ${this.psi.hasVariableInfection ? this.renderInfectionInfo() : ''}
    `;
  }

  private async activateCheckoutTime() {
    const { token } = requestCharacter(this);
    await createMessage({
      entity: token || this.character,
      visibility: MessageVisibility.WhisperGM,
      data: {
        header: {
          heading: localize('checkoutTime'),
          subheadings: this.psi.name,
        },
      },
    });
    this.psi.setCriticalSuccessState('checkoutTime', false);
  }

  private renderInfectionInfo() {
    const {
      activePsiInfluences,
      receded,
      checkoutTime,
      interference,
    } = this.psi;
    // TODO add checkoutTime/interference descriptions
    console.log(activePsiInfluences);
    return html`
      ${this.renderInfectionTracker()}
      ${notEmpty(activePsiInfluences) || checkoutTime || interference
        ? html`
            <div class="active-influences">
              ${checkoutTime
                ? html` <colored-tag
                    type="usable"
                    clickable
                    ?disabled=${this.character.disabled}
                    @click=${this.activateCheckoutTime}
                  >
                    ${localize('checkoutTime')}
                  </colored-tag>`
                : ''}
              ${interference
                ? html` <colored-tag
                    type="usable"
                    clickable
                    @click=${this.startInterferenceTest}
                    ?disabled=${this.character.disabled}
                  >
                    ${localize('interference')}
                  </colored-tag>`
                : ''}
              ${repeat(
                sortBy([...activePsiInfluences], ([{ type }]) => type),
                ([{ id }]) => id,
                ([influence, timeState]) => {
                  const remaining = prettyMilliseconds(timeState.remaining, {
                    compact: true,
                    approx: true,
                    whenZero: localize('expired'),
                  });
                  const badge = html`
                    <span
                      class="badge ${timeState.completed ? 'expired' : ''}"
                      slot="after"
                      >${remaining}</span
                    >
                  `;

                  if (influence.type === PsiInfluenceType.Motivation) {
                    const { motivation, description } = influence;
                    return html`
                      <colored-tag
                        data-roll=${influence.roll}
                        @click=${this.openActiveInfluenceMenu}
                        clickable
                        ?disabled=${this.character.disabled}
                        @mouseover=${(
                          ev: MouseEvent & { currentTarget: HTMLElement },
                        ) => {
                          tooltip.attach({
                            el: ev.currentTarget,
                            content: html` <p
                                style="color: var(--color-primary-alt)"
                              >
                                ${prettyMilliseconds(timeState.remaining, {
                                  compact: false,
                                  whenZero: localize('expired'),
                                })}
                                ${timeState.completed
                                  ? ''
                                  : localize('remaining').toLocaleLowerCase()}
                              </p>
                              <p>${description}</p>`,
                            position: 'bottom-middle',
                          });
                        }}
                      >
                        <span class="motivation"
                          ><mwc-icon class=${motivation.stance}
                            >${motivation.stance === MotivationStance.Support
                              ? 'add'
                              : 'remove'}</mwc-icon
                          >
                          ${motivation.cause}
                        </span>
                        ${badge}
                      </colored-tag>
                    `;
                  }

                  if (influence.type === PsiInfluenceType.Trait) {
                    const { name, description } = influenceInfo(influence);
                    return html`
                      <colored-tag
                        data-roll=${influence.roll}
                        @click=${this.openActiveInfluenceMenu}
                        clickable
                        ?disabled=${this.character.disabled}
                        @mouseover=${(
                          ev: MouseEvent & { currentTarget: HTMLElement },
                        ) => {
                          tooltip.attach({
                            el: ev.currentTarget,
                            content: html` <p
                                style="color: var(--color-primary-alt)"
                              >
                                ${prettyMilliseconds(timeState.remaining, {
                                  compact: false,
                                  whenZero: localize('expired'),
                                })}
                                ${timeState.completed
                                  ? ''
                                  : localize('remaining').toLocaleLowerCase()}
                              </p>
                              <enriched-html
                                style="padding: 0 0.5rem"
                                .content=${description}
                              ></enriched-html>`,
                            position: 'bottom-middle',
                          });
                        }}
                        >${name} ${badge}
                      </colored-tag>
                    `;
                  }
                  if (influence.type === PsiInfluenceType.Unique) {
                    const { name, description } = influenceInfo(influence);
                    const {
                      durationFormula,
                      interval,
                      items,
                    } = influence.effects;
                    const hasEffects = items.length;
                    return html` <span
                      ><colored-tag
                        data-roll=${influence.roll}
                        data-tooltip=${description}
                        @mouseover=${tooltip.fromData}
                        @click=${this.openActiveInfluenceMenu}
                        clickable
                        ?disabled=${this.character.disabled}
                        >${name} ${badge}
                      </colored-tag>
                      ${hasEffects
                        ? html`<colored-tag
                            type="usable"
                            clickable
                            ?disabled=${this.character.disabled}
                            @click=${() => {
                              const roll = rollFormula(durationFormula);
                              roll?.toMessage({ flavor: localize(interval) });
                              const total = roll?.total || 1;
                              const duration =
                                interval === EPTimeInterval.ActionTurns
                                  ? CommonInterval.Turn * total
                                  : toMilliseconds({ [interval]: total });
                              this.character.updater
                                .path('data', 'temporary')
                                .commit((temps) =>
                                  addFeature(
                                    temps,
                                    createTemporaryFeature.effects({
                                      name,
                                      effects: items,
                                      duration,
                                    }),
                                  ),
                                );
                            }}
                            >${localize('applyEffects')}</colored-tag
                          >`
                        : ''}</span
                    >`;
                  }

                  const { name, description } = influenceInfo(influence);

                  return html`
                    <colored-tag
                      data-roll=${influence.roll}
                      data-tooltip=${description}
                      @mouseover=${tooltip.fromData}
                      @click=${this.openActiveInfluenceMenu}
                      clickable
                      ?disabled=${this.character.disabled}
                      >${name} ${badge}
                    </colored-tag>
                  `;
                },
              )}
            </div>
          `
        : ''}
      ${receded
        ? html` <p>${localize('immuneToInfluencesUntilRecharge')}</p> `
        : ''}
    `;
  }

  private renderInfectionTracker() {
    const {
      infectionRating,
      baseInfectionRating,
      editable,
      hasChiIncreasedEffect,
      level,
    } = this.psi;

    return html` <section class="infection-tracker">
      ${renderAutoForm({
        classes: 'infection',
        disabled: !editable,
        props: { infectionRating },
        update: ({ infectionRating }) =>
          infectionRating && this.psi.updateInfectionRating(infectionRating),
        fields: ({ infectionRating }) =>
          renderNumberInput(infectionRating, {
            min: baseInfectionRating,
            max: 99,
          }),
      })}

      <mwc-linear-progress
        class="infection-progress"
        progress=${infectionRating / 99}
      ></mwc-linear-progress>
      <div
        class="progress-overlay"
        style="width: calc(${baseInfectionRating}% + 1px)"
      ></div>

      <div
        class=${classMap({
          'increased-chi': true,
          active: hasChiIncreasedEffect,
        })}
        title="${localize(PsiPush.IncreasedEffect)} ${localize('psiChi')}"
      >
        ${localize('psiChi')} +
      </div>
      ${level > 1 ? this.renderFreePush() : ''}
    </section>`;
  }

  private renderFreePush() {
    const { hasFreePushEffect, activeFreePush } = this.psi;
    const freePushClasses = {
      active: hasFreePushEffect,
      selection: hasFreePushEffect && !activeFreePush,
    };
    return html`
      <div
        class="free-push ${classMap(freePushClasses)}"
        title=${localize('freePush')}
      >
        <button @click=${this.openFreePushMenu} ?disabled=${!hasFreePushEffect}>
          ${localize(
            freePushClasses.active
              ? activeFreePush || 'selectFreePush'
              : 'freePush',
          )}
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'character-view-psi': CharacterViewPsi;
  }
}

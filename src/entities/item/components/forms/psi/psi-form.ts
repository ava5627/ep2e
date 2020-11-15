import {
  renderNumberField,
  renderLabeledCheckbox,
  renderTextField,
} from '@src/components/field/fields';
import { renderAutoForm, renderUpdaterForm } from '@src/components/form/forms';
import {
  closeWindow,
  openWindow,
} from '@src/components/window/window-controls';
import {
  ResizeOption,
  SlWindowEventName,
} from '@src/components/window/window-options';
import { enumValues, ExsurgentStrain } from '@src/data-enums';
import { entityFormCommonStyles } from '@src/entities/components/form-layout/entity-form-common-styles';
import { renderItemForm } from '@src/entities/item/item-views';
import type { Psi } from '@src/entities/item/proxies/psi';
import { idProp, matchID, StringID } from '@src/features/feature-helpers';
import {
  DamageInfluence,
  influenceInfo,
  InfluenceRoll,
  MotivationInfluence,
  PsiInfluenceType,
  UniqueInfluence,
} from '@src/features/psi-influence';
import { dragValue } from '@src/foundry/drag-and-drop';
import { localize } from '@src/foundry/localization';
import { customElement, html, property, PropertyValues } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map';
import { repeat } from 'lit-html/directives/repeat';
import { stopEvent } from 'weightless';
import { ItemFormBase } from '../item-form-base';
import styles from './psi-form.scss';

@customElement('psi-form')
export class PsiForm extends ItemFormBase {
  static get is() {
    return 'psi-form' as const;
  }

  static styles = [entityFormCommonStyles, styles];

  @property({ attribute: false }) item!: Psi;

  private traitSheetKeys = new Map<InfluenceRoll, {}>();

  private editingRoll: InfluenceRoll = 1;

  async connectedCallback() {
    if (!this.disabled && this.item.influencesData?.length !== 6) {
      await this.item.setupDefaultInfluences();
    }
    super.connectedCallback();
  }

  disconnectedCallback() {
    this.traitSheetKeys.forEach(closeWindow);
    this.traitSheetKeys.clear();
    super.disconnectedCallback();
  }

  update(changedProps: PropertyValues) {
    for (const [roll] of this.traitSheetKeys) {
      this.openItemSheet(roll);
    }
    if (
      this.drawerContentRenderer &&
      this.editingInfluence.type === PsiInfluenceType.Trait
    ) {
      this.drawerContentRenderer = null;
    }

    super.update(changedProps);
  }

  get editingInfluence() {
    return this.item.fullInfluences[this.editingRoll];
  }

  private openItemSheet(roll: InfluenceRoll) {
    const influence = this.item.fullInfluences[roll];
    const { traitSheetKeys } = this;
    let key = traitSheetKeys.get(roll);
    if (!key) {
      key = {};
      traitSheetKeys.set(roll, key);
    }

    if (influence.type !== PsiInfluenceType.Trait) {
      closeWindow(key);
      traitSheetKeys.delete(roll);
      return;
    }

    const { wasConnected, win } = openWindow(
      {
        key: key,
        content: renderItemForm(influence.trait),
        adjacentEl: this,
        forceFocus: true,
        name: influence.trait.fullName,
      },
      { resizable: ResizeOption.Vertical },
    );
    if (!wasConnected) {
      win.addEventListener(
        SlWindowEventName.Closed,
        () => traitSheetKeys.delete(roll),
        { once: true },
      );
    }
  }

  render() {
    const {
      updater,
      type,
      hasVariableInfection,
      name,
      fullInfluences,
      influencesData,
    } = this.item;
    const { disabled } = this;
    return html`
      <entity-form-layout noSidebar>
        <div slot="details">
          <section>
            <sl-header heading="${localize('psi')} ${localize('trait')}">
              ${hasVariableInfection
                ? ''
                : renderUpdaterForm(updater.prop('data'), {
                    disabled,
                    slot: 'action',
                    fields: ({ requireBioSubstrate }) =>
                      renderLabeledCheckbox(requireBioSubstrate),
                  })}
            </sl-header>
            <div class="detail-forms">
              ${this.strainOptions}
              ${renderUpdaterForm(updater.prop('data'), {
                disabled,
                fields: ({ strain }) =>
                  renderTextField(strain, { listId: 'strains' }),
              })}
              ${renderAutoForm({
                props: { name },
                update: ({ name }) => {
                  this.item.updater.prop('name').commit(name || this.item.name);
                  this.requestUpdate();
                },
                disabled,
                fields: ({ name }) =>
                  renderTextField({ ...name, label: localize('substrain') }),
              })}
              ${renderUpdaterForm(updater.prop('data'), {
                disabled,
                fields: ({ level }) =>
                  renderNumberField(level, {
                    min: 1,
                    max: game.user.isGM ? 3 : 2,
                  }),
              })}
            </div>
            ${this.strainOptions}
          </section>

          ${influencesData
            ? repeat(influencesData, idProp, ({ roll, type }) => {
                const fullInfluence = this.item.fullInfluences[roll];
                const { name, description } = influenceInfo(fullInfluence);
                const isDamage = type === PsiInfluenceType.Damage;
                const hideEnriched = isDamage || !description;
                return html`
                  <sl-dropzone class="influence" ?disabled=${disabled}>
                    <span
                      class="roll ${classMap({
                        'with-description': !hideEnriched,
                      })}"
                      draggable=${dragValue(!disabled)}
                      @dragstart=${(ev: DragEvent) => {
                        const el = ev.currentTarget as HTMLElement;
                        el.classList.add('dragged');
                      }}
                      @dragend=${(ev: DragEvent) => {
                        const el = ev.currentTarget as HTMLElement;
                        el.classList.remove('dragged');
                      }}
                      >${roll}</span
                    >

                    <span class="name"
                      >${name}
                      ${isDamage
                        ? html`<span class="formula">${description}</span>`
                        : ''}</span
                    >
                    ${hideEnriched
                      ? ''
                      : html`
                          <enriched-html
                            class="description"
                            content=${description}
                          ></enriched-html>
                        `}

                    <div class="actions">
                      <mwc-icon-button
                        icon="edit"
                        ?disabled=${disabled}
                        @click=${() => {
                          if (type === PsiInfluenceType.Trait) {
                            this.openItemSheet(roll);
                          } else this.setDrawer(this.influenceEditor);
                        }}
                      ></mwc-icon-button>
                      <mwc-icon-button
                        icon="transform"
                        ?disabled=${disabled}
                      ></mwc-icon-button>
                    </div>
                  </sl-dropzone>
                `;
              })
            : ''}
        </div>

        <editor-wrapper
          slot="description"
          ?disabled=${disabled}
          .updateActions=${updater.prop('data', 'description')}
        ></editor-wrapper>
        ${this.renderDrawerContent()}
      </entity-form-layout>
    `;
  }

  private influenceEditor() {
    const influence = this.editingInfluence;
    switch (influence.type) {
      case PsiInfluenceType.Trait:
        return html``;
      case PsiInfluenceType.Damage:
        return this.editDamage(influence);
      case PsiInfluenceType.Motivation:
        return this.editMotivation(influence);
      case PsiInfluenceType.Unique:
        return this.editUnique(influence);
    }
  }

  private editDamage(influence: StringID<DamageInfluence>) {
    return html``;
  }

  private editMotivation(influence: StringID<MotivationInfluence>) {
    return html``;
  }

  private editUnique(influence: StringID<UniqueInfluence>) {
    return html``;
  }

  private strainOptions = html`
    <datalist id="strains">
      ${enumValues(ExsurgentStrain).map(
        (strain) => html` <option value=${localize(strain)}></option> `,
      )}
    </datalist>
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'psi-form': PsiForm;
  }
}

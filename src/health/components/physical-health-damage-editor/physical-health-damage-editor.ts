import {
  renderFormulaField,
  renderNumberField,
  renderTextField,
} from '@src/components/field/fields';
import { renderAutoForm } from '@src/components/form/forms';
import { localize } from '@src/foundry/localization';
import type { BiologicalHealth } from '@src/health/biological-health';
import { formatDamageType } from '@src/health/health';
import {
  createPhysicalDamage,
  PhysicalDamage,
  RollMultiplier,
} from '@src/health/health-changes';
import type { SyntheticHealth } from '@src/health/synthetic-health';
import { customElement, html } from 'lit-element';
import { pipe, reverse, takeWhile } from 'remeda';
import { HealthEditBase } from '../health-edit-base';

@customElement('physical-health-damage-editor')
export class PhysicalHealthDamageEditor extends HealthEditBase<
  BiologicalHealth | SyntheticHealth,
  PhysicalDamage
> {
  static get is() {
    return 'physical-health-damage-editor' as const;
  }

  protected createEditable() {
    return createPhysicalDamage(this.damage || { damageValue: 0, formula: '' });
  }

  protected createModification() {
    return {
      ...super.createModification(),
      cumulativeDotID: this.damage?.cumulativeDotID || null,
    };
  }

  render() {
    if (this.damage?.cumulativeDotID) {
      const { cumulativeDotID } = this.damage;
      pipe(
        this.health.log,
        reverse(),
        takeWhile((entry) => entry.cumulativeDotID === cumulativeDotID),
        console.log,
      );
    }
    // TODO cumulative damage
    return html`
      <div class="damage-settings">
        ${renderAutoForm({
          props: this.editableDamage,
          noDebounce: true,
          update: (changed, orig) =>
            (this.editableDamage = { ...orig, ...changed }),
          fields: ({ damageValue, source, formula }) => [
            renderTextField(source, { placeholder: localize('editor') }),
            renderFormulaField(formula),
            renderNumberField(
              { ...damageValue, label: localize('damage') },
              { min: 0 },
            ),
          ],
        })}
        ${renderAutoForm({
          props: { multiplier: String(this.editableDamage.multiplier) },
          update: ({ multiplier }) =>
            (this.editableDamage = {
              ...this.editableDamage,
              multiplier: (Number(multiplier) || 1) as RollMultiplier,
            }),
          fields: ({ multiplier }) => html`
            <div class="multiplier">
              <span>${localize('multiplier')}</span>
              <div class="radios">
                ${[0.5, 1, 2]
                  .map(String)
                  .map(
                    (mp) => html`
                      <mwc-formfield label=${mp}>
                        <mwc-radio
                          name=${multiplier.prop}
                          value=${mp}
                          ?checked=${mp === multiplier.value}
                        ></mwc-radio
                      ></mwc-formfield>
                    `,
                  )}
              </div>
              ${this.editableDamage.multiplier !== 1 ? html`
        <span>${formatDamageType(this.health.type)} ${this.damageValue}</span>
        ` : ""}
            </div>
          `,
        })}
       
        ${this.armor
          ? html`
              <div class="armor-toggles">
                <mwc-button
                  dense
                  label=${localize('armorPiercing')}
                  ?outlined=${!this.editableDamage.armorPiercing}
                  ?unelevated=${this.editableDamage.armorPiercing}
                  @click=${this.toggleArmorPiercing}
                ></mwc-button>
                <mwc-button
                  ?outlined=${!this.editableDamage.reduceAVbyDV}
                  ?unelevated=${this.editableDamage.reduceAVbyDV}
                  dense
                  label=${localize('reduceAVbyDV')}
                  @click=${this.toggleArmorReduce}
                ></mwc-button>
              </div>
            `
          : ''}
      </div>

      ${this.renderCommon()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'physical-health-damage-editor': PhysicalHealthDamageEditor;
  }
}

import {
  renderFormulaField,
  renderNumberField,
  renderTextField,
} from '@src/components/field/fields';
import { renderAutoForm } from '@src/components/form/forms';
import { localize } from '@src/foundry/localization';
import type { BiologicalHealth } from '@src/health/biological-health';
import {
  createPhysicalDamage,
  PhysicalDamage,
} from '@src/health/health-changes';
import type { SyntheticHealth } from '@src/health/synthetic-health';
import { customElement, html } from 'lit-element';
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

  render() {
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

import { ChatMessageRequestEvent } from '@src/chat/chat-message-request-event';
import type { MessageData } from '@src/chat/message-data';
import type { ChatMessageEP } from '@src/entities/chat-message';
import { customElement, LitElement, property, html } from 'lit-element';
import styles from './message-content.scss';

@customElement('message-content')
export class MessageContent extends LitElement {
  static get is() {
    return 'message-content' as const;
  }

  static styles = [styles];

  @property({ attribute: false }) message!: ChatMessageEP;

  @property({ type: Object }) data!: MessageData;

  @property({ type: Boolean }) disabled = false;

  firstUpdated() {
    this.addEventListener(ChatMessageRequestEvent.is, (ev) => {
      if (ev instanceof ChatMessageRequestEvent) {
        ev.chatMessage = this.message;
        ev.nonInteractive = this.disabled;
        ev.stopPropagation();
      }
    });
  }

  render() {
    const {
      header,
      stress,
      healthChange,
      heal,
      damage,
      substanceUse,
      explosiveUse,
      attackTraitInfo,
      areaEffect,
      meleeAttack,
      successTest,
      favor,
      targets
    } = this.data;
    if (!this.message.isContentVisible) return '';
    return html`
      ${header ? html` <message-header .data=${header}></message-header> ` : ''}
      ${areaEffect
        ? html`
            <message-area-effect
              .areaEffect=${areaEffect}
            ></message-area-effect>
          `
        : ''}
      ${successTest
        ? html`<message-success-test
            .successTest=${successTest}
          ></message-success-test>`
        : ''}
      ${favor ? html` <message-favor .favor=${favor}></message-favor> ` : ''}
      ${meleeAttack
        ? html`
            <message-melee-attack
              .meleeAttack=${meleeAttack}
              .successTest=${successTest}
            ></message-melee-attack>
          `
        : ''}
      ${explosiveUse
        ? html`
            <message-explosive
              .explosiveUse=${explosiveUse}
            ></message-explosive>
          `
        : ''}
      ${heal ? html` <message-heal .heal=${heal}></message-heal> ` : ''}
      ${damage ? html`<message-damage .damage=${damage}></message-damage>` : ''}
      ${stress
        ? html` <message-stress-test .stress=${stress}></message-stress-test> `
        : ''}
      ${attackTraitInfo
        ? html`
            <message-attack-traits
              .attackTraitInfo=${attackTraitInfo}
            ></message-attack-traits>
          `
        : ''}
      ${substanceUse
        ? html`<message-substance-use
            .substanceUse=${substanceUse}
          ></message-substance-use>`
        : ''}
      ${healthChange
        ? html`
            <message-health-change
              .healthChange=${healthChange}
            ></message-health-change>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'message-content': MessageContent;
  }
}

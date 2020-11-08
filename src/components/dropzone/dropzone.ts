import { dragSource, Drop } from '@src/foundry/drag-and-drop';
import {
  customElement,
  LitElement,
  property,
  html,
  internalProperty,
} from 'lit-element';
import mix from 'mix-with/lib';
import { LazyRipple } from '../mixins/lazy-ripple';
import styles from './dropzone.scss';

const dragEvents = ['dragleave', 'dragend', 'drop'] as const;

@customElement('sl-dropzone')
export class DropZone extends mix(LitElement).with(LazyRipple) {
  static get is() {
    return 'sl-dropzone' as const;
  }

  static styles = [styles];

  private static _highlighted: DropZone | null = null;

  private static set highlighted(cell: DropZone | null) {
    const { _highlighted } = DropZone;
    if (_highlighted === cell) return;
    _highlighted?.removeAttribute('outlined');
    cell?.setAttribute('outlined', '');
    DropZone._highlighted = cell;
  }

  @property({ type: Boolean }) disabled = false;

  firstUpdated() {
    this.addEventListener('dragover', this.setOutline);
    this.addEventListener('dragenter', this.setOutline);

    for (const event of dragEvents) {
      this.addEventListener(event, this.removeBackgroundHighlight);
    }
  }

  private setOutline = () => {
    if (this.disabled) return;
    DropZone.highlighted = this;
  };

  private removeBackgroundHighlight = (ev: DragEvent) => {
    if (ev.type === 'drop') {
      this.rippleHandlers.startPress(ev);
      requestAnimationFrame(() => {
        this.rippleHandlers.endPress();
        setTimeout(() =>  DropZone.highlighted = null, 350);
      });
    } else DropZone.highlighted = null;
  };

  render() {
    return html` <slot></slot> ${this.renderRipple(this.disabled)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-dropzone': DropZone;
  }
}

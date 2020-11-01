import { throttle, debounce } from '@src/utility/decorators';
import {
  assignStyles,
  leftTop,
  dimensions,
  px,
  joinCoor,
  toggleTouchAction,
  resizeElement,
  dragElement,
  repositionIfNeeded,
  resizeObsAvailable,
} from '@src/utility/dom';
import { notEmpty } from '@src/utility/helpers';
import {
  customElement,
  LitElement,
  property,
  html,
  query,
  TemplateResult,
} from 'lit-element';
import { render, nothing } from 'lit-html';
import { reposition } from 'nanopop';
import { mapToObj, clamp, anyPass } from 'remeda';
import { ResizeOption, SlWindowEventName } from './window-options';
import styles from './window.scss';
import { observer } from '@material/mwc-base/observer.js';

const isButton = (target: EventTarget | null): target is HTMLElement => {
  return (
    target instanceof HTMLElement &&
    !!(
      target.localName.includes('button') ||
      target.getAttribute('role') === 'button' ||
      target.localName === 'a'
    )
  );
};

const shadowAnimationOptions = {
  duration: 200,
  fill: 'forwards',
  delay: 50,
  easing: 'ease-in-out',
} as const;

const shadowElStyles = {
  position: 'absolute',
  transformOrigin: 'top left',
  zIndex: '2000',
  background: 'rgba(10, 5, 20, 0.2)',
  overflow: 'hidden',
  pointerEvents: 'none',
} as const;

const resizeList = [
  ResizeOption.Both,
  ResizeOption.Vertical,
  ResizeOption.Horizontal,
] as const;

@customElement('sl-window')
export class SlWindow extends LitElement {
  static get is() {
    return 'sl-window' as const;
  }

  static styles = [styles];

  static focusedWindow: SlWindow | null = null;

  static container = document.body;

  private static _zIndex = 99;

  private static grantFocus(win: SlWindow) {
    if (!win.focused) {
      const { focusedWindow } = SlWindow;
      if (focusedWindow) focusedWindow.focused = false;
      win.focused = true;
      SlWindow.focusedWindow = win;
      requestAnimationFrame(() => SlWindow.updateZIndex(win));
    }
  }

  static unfocus(win: SlWindow) {
    if (win.focused) {
      win.focused = false;
      SlWindow.focusedWindow = null;
    }
  }

  static updateZIndex(win: SlWindow) {
    if (Number(win.style.zIndex) < this._zIndex) {
      win.style.zIndex = `${++this._zIndex}`;
    }
  }

  static headerButton({
    onClick,
    content,
    disabled = false,
  }: {
    onClick: (ev: MouseEvent) => unknown;
    content: TemplateResult;
    disabled?: boolean;
  }) {
    return html`
      <wl-list-item
        ?disabled=${disabled}
        clickable
        role="button"
        slot="header-button"
        @click=${onClick}
      >
        <div>${content}</div>
      </wl-list-item>
    `;
  }

  @property({ type: Boolean, reflect: true })
  @observer(function (this: SlWindow, val: boolean) {
    this.emit(SlWindowEventName.FocusChange);
  })
  focused = false;

  @property({ type: Boolean, reflect: true })
  @observer(function (this: SlWindow, old: boolean) {
    this.emit(SlWindowEventName.MinimizeToggled);
    this.animateMinimize();
  })
  minimized = false;

  @property({ type: String })
  @observer(function (this: SlWindow, name: string) {
    this.emit(SlWindowEventName.NameChanged);
  })
  name = 'New Window';

  @property({ type: Boolean }) clearContentOnClose = false;

  @property({ type: String }) resizable = ResizeOption.None;

  @query('#header') private header!: HTMLElement;

  @query('.content') private contentContainer!: HTMLElement;

  @query('slot[name="footer"]') private footerSlot!: HTMLSlotElement;

  @query('.close-button') private closeButton!: HTMLElement;

  private resizeObs!: ResizeObserver | null;

  private closing = false;

  async connectedCallback() {
    super.connectedCallback();
    this.gainFocus();
    await this.updateComplete;
    this.addEventListener('pointerdown', this);
    this.addEventListener('keydown', this);
    window.addEventListener('resize', this);
    requestAnimationFrame(() => {
      this.setupResizeObserver();
      if (!this.style.opacity) {
        this.animate(
          { opacity: [0, 1], transform: ['scale(0.97)', 'scale(1)'] },
          { duration: 300, easing: 'ease-out' },
        );
      }
    });
  }

  disconnectedCallback() {
    this.resizeObs?.disconnect();
    window.removeEventListener('resize', this);
    super.disconnectedCallback();
  }

  handleEvent(ev: Event) {
    switch (ev.type) {
      case 'pointerdown': {
        const { header } = this;
        if (!ev.composedPath().some((el) => el === header)) this.gainFocus();
        break;
      }

      case 'resize':
        this.confirmPosition();
        break;

      case 'keydown': {
        const { key } = ev as KeyboardEvent;
        if (key === 'Escape') {
          ev.stopPropagation();
          this.closeButton.focus();
        } else if (key === 'Tab') {
          ev.stopPropagation();
        }

        break;
      }

      default:
        break;
    }
  }

  close() {
    if (this.closing || !this.isConnected) {
      return this.emit(SlWindowEventName.Closed);
    }

    this.closing = true;
    this.style.pointerEvents = 'none';
    this.emit(SlWindowEventName.Closing);
    SlWindow.unfocus(this);
    return new Promise<void>((resolve) => {
      this.animate(
        { opacity: [1, 0], transform: ['scale(1)', 'scale(0.97)'] },
        { duration: 200 },
      ).onfinish = () => {
        this.style.pointerEvents = '';
        this.remove();
        resolve();
        this.closing = false;
        this.emit(SlWindowEventName.Closed);
        if (this.clearContentOnClose) render(nothing, this);
      };
    });
  }

  toggleMinimize() {
    this.minimized = !this.minimized;
  }

  gainFocus() {
    if (!this.resizeObs) this.confirmPosition();
    // this.minimized = false;
    SlWindow.grantFocus(this);
    return this;
  }

  async positionAdjacentToElement(toEl: HTMLElement) {
    if (!toEl?.offsetParent) return;
    const noAnimation = this.isConnected;
    if (!noAnimation) this.style.opacity = '0';
    return new Promise<void>((resolve) => {
      const onFinish = () => {
        requestAnimationFrame(() => {
          this.style.opacity = '';
          this.gainFocus();
          resolve();
        });
      };
      requestAnimationFrame(() => {
        const position = reposition(toEl, this, { position: 'left' });
        // const { wentRight } = positionRelatively({
        //   toEl,
        //   element: this,
        // });
        if (noAnimation) onFinish();
        else this.animateShadowEl(toEl, position?.[0] === 'r', onFinish);
      });
    });
  }

  private animateShadowEl(
    toEl: HTMLElement,
    wentRight: boolean,
    onFinish: () => void,
  ) {
    const relativeRect = toEl.getBoundingClientRect();
    const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = this;
    const div = document.createElement('div');
    document.body.appendChild(div);

    assignStyles(div, {
      borderRadius: getComputedStyle(toEl).borderRadius,
      ...shadowElStyles,
      ...mapToObj([...leftTop, ...dimensions], (prop) => [
        prop,
        px(relativeRect[prop]),
      ]),
    }).animate(
      {
        transform: [
          `translate(0) scale(1) rotateZ(${Math.ceil(
            Math.random() * (wentRight ? -3 : 3),
          )}deg)`,
          `translate(${joinCoor({
            x: offsetLeft - relativeRect.left,
            y: offsetTop - relativeRect.top,
          })}) scale(${[
            offsetWidth / relativeRect.width,
            offsetHeight / relativeRect.height,
          ]
            .map((val) => Math.min(val, 10000))
            .join(', ')})`,
        ],
      },
      {
        ...shadowAnimationOptions,
        duration: shadowAnimationOptions.duration - 50,
      },
    ).onfinish = () => {
      const opacity = [1, 0];
      div.animate({ opacity }, shadowAnimationOptions).onfinish = () =>
        div.remove();
      this.animate(
        { opacity: opacity.reverse() },
        { duration: shadowAnimationOptions.duration },
      ).onfinish = onFinish;
    };
  }

  private static minimizeAnimationOptions = {
    duration: 250,
    easing: 'ease-in-out',
  };

  @throttle(200, true)
  private animateMinimize() {
    const { contentContainer } = this;

    const { minimizeAnimationOptions } = SlWindow;
    if (this.minimized) {
      contentContainer.style.display = 'none';
    } else {
      if (contentContainer.style.display !== 'none') return;
      contentContainer.style.display = '';
      this.gainFocus();
      contentContainer.animate(
        { opacity: [0.25, 1] },
        minimizeAnimationOptions,
      ).onfinish = () => this.confirmPosition();
    }
  }

  private resetSize(ev: Event) {
    if (ev.composedPath().some(isButton)) return;

    if (this.minimized) this.minimized = false;
    else if (this.resizable !== ResizeOption.None) {
      const { height, width } = this.contentContainer.style;
      if (height || width)
        assignStyles(this.contentContainer, { height: '', width: '' });
      // else
      //   assignStyles(this.contentContainer, {
      //     height:
      //       this.resizable !== ResizeOption.Horizontal
      //         ? px(window.innerHeight)
      //         : "",
      //     width:
      //       this.resizable !== ResizeOption.Vertical
      //         ? px(window.innerWidth)
      //         : "",
      //   });
    }
  }

  private resize(ev: PointerEvent) {
    const { currentTarget } = ev;
    if (currentTarget instanceof HTMLElement) {
      const resize = currentTarget.getAttribute('data-resize') as ResizeOption;
      const reverse = currentTarget.classList.contains('alt');

      const [width, height] = [
        ResizeOption.Horizontal,
        ResizeOption.Vertical,
      ].map((option) => resize === option || resize === ResizeOption.Both);

      const { bottom, right, top, left } = this.getBoundingClientRect();
      const { contentContainer, header, footerSlot } = this;
      const { offsetHeight, offsetWidth } = SlWindow.container;

      const {
        minWidth,
        minHeight,
      } = (contentContainer.firstElementChild as HTMLSlotElement)
        .assignedElements({ flatten: true })
        .reduce(
          (accum, el) => {
            const { minHeight, minWidth } = getComputedStyle(el);
            // TODO: fix this to work with non px values
            // 100% min width is what I need
            accum.minHeight += parseInt(minHeight) || 0;
            accum.minWidth = Math.max(accum.minWidth, parseInt(minWidth) || 0);
            return accum;
          },
          {
            minHeight: 0,
            minWidth: parseInt(getComputedStyle(header).minWidth) || 0,
          },
        );

      this.resizeObs?.unobserve(this);

      if (reverse) {
        assignStyles(this, {
          top: 'unset',
          left: 'unset',
          bottom: px(offsetHeight - bottom),
          right: px(offsetWidth - right),
        });
      }

      const maxWidth = (reverse ? right : offsetWidth - left) - 5;
      const maxHeight =
        (reverse ? bottom : offsetHeight - top) -
        header.offsetHeight -
        footerSlot.offsetHeight;
      const undoTouch = toggleTouchAction(this);

      assignStyles(contentContainer, {
        maxWidth: px(maxWidth),
        maxHeight: px(maxHeight),
        minHeight: px(
          clamp(minHeight, {
            min: 0,
            max: offsetHeight - this.header.offsetHeight,
          }),
        ),
        // minWidth: px(clamp(minWidth, { min: 0, max: offsetWidth })),
      });

      resizeElement({
        element: contentContainer,
        ev,
        width,
        height,
        reverse,
        onEnd: () => {
          undoTouch();
          this.resizeObs?.observe(this);
          const { offsetWidth, offsetHeight } = contentContainer;
          const newMax =
            window.innerHeight - header.offsetHeight - footerSlot.offsetHeight;
          assignStyles(contentContainer, {
            maxWidth: '',
            maxHeight: '',
            // ...(width ? { width: px(Math.min(offsetWidth, maxWidth)) } : {}),
            // width: off
            ...(height || newMax < maxHeight
              ? { height: px(Math.min(offsetHeight, maxHeight, newMax)) }
              : {}),
          });
          if (reverse) {
            const { top, left } = this.getBoundingClientRect();
            assignStyles(this, {
              top: px(top),
              left: px(left),
              bottom: 'unset',
              right: 'unset',
            });
          }
        },
      });
    }
  }

  private startDrag(ev: PointerEvent) {
    if (
      ev.defaultPrevented ||
      ev
        .composedPath()
        .some(anyPass([isButton, (e) => e instanceof HTMLInputElement]))
    )
      return;
    this.gainFocus();

    dragElement({
      element: this,
      ev,
      onEnd: toggleTouchAction(this),
    });
  }

  @debounce(400)
  private confirmPosition() {
    repositionIfNeeded(this);
  }

  private setupResizeObserver() {
    if (!this.resizeObs && resizeObsAvailable) {
      this.resizeObs = new ResizeObserver(() => this.confirmPosition());
      this.resizeObs.observe(this);
    }
  }

  private emit(eventName: SlWindowEventName) {
    this.dispatchEvent(new CustomEvent(eventName));
  }

  private toggleHeaderVisibility(ev: Event) {
    if (ev.currentTarget instanceof HTMLSlotElement) {
      this.header.classList.toggle(
        'alt',
        notEmpty(ev.currentTarget.assignedElements({ flatten: true })),
      );
    }
  }

  render() {
    return html`
      <header
        id="header"
        @dblclick=${this.resetSize}
        @pointerdown=${this.startDrag}
      >
        <div class="controls">
          <wl-list-item
            class="minimize-button"
            role="button"
            clickable
            @click=${this.toggleMinimize}
          >
            <mwc-icon>${this.minimized ? 'open_in_full' : 'remove'}</mwc-icon>
          </wl-list-item>
          <wl-list-item
            class="close-button"
            role="button"
            clickable
            @click=${this.close}
          >
            <mwc-icon>close</mwc-icon>
          </wl-list-item>
        </div>
        <slot name="header-button"> </slot>
        ${this.minimized
          ? html`<div class="heading">${this.name}</div>`
          : html` <slot
              name="header"
              @slotchange=${this.toggleHeaderVisibility}
              @pointerdown=${this.gainFocus}
            >
              <div class="heading">${this.name}</div>
            </slot>`}
      </header>
      <focus-trap class="content">
        <slot></slot>
      </focus-trap>
      <slot name="footer"></slot>
      ${this.resizable !== ResizeOption.None
        ? resizeList.map((option) => {
            const hidden = ![ResizeOption.Both, option].includes(
              this.resizable,
            );
            return html`
              <div
                class="resize-handle ${option}-resize"
                data-resize=${option}
                @pointerdown=${this.resize}
                ?hidden=${hidden}
              ></div>
              ${option === ResizeOption.Both
                ? ''
                : html`
                    <div
                      class="resize-handle ${option}-resize alt"
                      data-resize=${option}
                      @pointerdown=${this.resize}
                      ?hidden=${hidden}
                    ></div>
                  `}
            `;
          })
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-window': SlWindow;
  }
}

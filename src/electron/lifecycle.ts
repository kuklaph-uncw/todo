interface DesktopWindow {
  hide(): void;
  show(): void;
  focus(): void;
  isMinimized(): boolean;
  restore(): void;
}

/** Closing a window may hide it; an explicit quit or OS shutdown always exits. */
export class WindowLifecycle {
  quitting = false;
  constructor(
    private readonly window: DesktopWindow,
    private readonly background: () => boolean,
    private readonly exit: () => void,
  ) {}
  close(event: { preventDefault(): void }): void {
    if (!this.quitting && this.background()) {
      event.preventDefault();
      this.window.hide();
    }
  }
  open(): void {
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }
  quit(): void {
    this.quitting = true;
    this.exit();
  }
}

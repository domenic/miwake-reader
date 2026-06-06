import { getContext, mount, unmount, type Component } from 'svelte';

export type DialogClosedBy = 'any' | 'closerequest' | 'none';

export interface DialogController {
  titleId: string;
  close: (returnValue?: string) => void;
}

const dialogControllerContext = Symbol('dialogController');
let nextDialogId = 0;

export function useDialogController() {
  const controller = getContext<DialogController | undefined>(dialogControllerContext);

  if (!controller) {
    throw new Error('Dialog components must be mounted with showDialog().');
  }

  return controller;
}

export function showDialog<T>(
  component: Component<any>,
  props: Record<string, unknown>,
  options: { closedBy: DialogClosedBy; resolveResult: (returnValue: string) => T }
): Promise<T> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const dialogId = ++nextDialogId;
    const titleId = `dialog-${dialogId}-title`;

    dialog.className =
      'writing-horizontal-tb mdc-elevation--z24 fixed inset-0 m-auto rounded-sm border-none bg-white p-6';
    dialog.closedBy = options.closedBy;
    dialog.setAttribute('aria-labelledby', titleId);
    document.body.append(dialog);

    const controller: DialogController = {
      titleId,
      close: (returnValue = '') => dialog.close(returnValue)
    };

    const comp = mount(component, {
      target: dialog,
      context: new Map([[dialogControllerContext, controller]]),
      props
    });

    dialog.addEventListener(
      'close',
      () => {
        const result = options.resolveResult(dialog.returnValue);
        unmount(comp);
        dialog.remove();
        resolve(result);
      },
      { once: true }
    );

    dialog.showModal();
  });
}

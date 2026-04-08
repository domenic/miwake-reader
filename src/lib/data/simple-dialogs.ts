import { mount, unmount, type Component } from 'svelte';
import ConfirmDialogContent from '$lib/components/confirm-dialog-content.svelte';
import MessageDialogContent from '$lib/components/message-dialog-content.svelte';
import NumberDialogContent from '$lib/components/number-dialog-content.svelte';
import { dialogSurfaceClasses } from '$lib/css-classes';

function showDialog<T>(
  component: Component<any>,
  props: Record<string, unknown>,
  options: { closedBy: string; resolveResult: (returnValue: string) => T }
): Promise<T> {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `writing-horizontal-tb fixed inset-0 m-auto border-none ${dialogSurfaceClasses}`;
    dialog.closedBy = options.closedBy;
    document.body.append(dialog);

    const comp = mount(component, {
      target: dialog,
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

export function confirmDialog({ title, message }: { title: string; message: string }) {
  return showDialog(
    ConfirmDialogContent,
    { title, message },
    {
      closedBy: 'any',
      resolveResult: (returnValue) => returnValue !== 'confirm'
    }
  );
}

export function messageDialog({ title, message }: { title: string; message: string }) {
  showDialog(
    MessageDialogContent,
    { title, message },
    {
      closedBy: 'closerequest',
      resolveResult: () => undefined
    }
  );
}

export function numberDialog({
  title,
  minValue,
  maxValue,
  actionLabel
}: {
  title: string;
  minValue: number;
  maxValue: number;
  actionLabel?: string;
}) {
  let value: number | undefined;
  return showDialog<number | undefined>(
    NumberDialogContent,
    { title, minValue, maxValue, actionLabel, setResult: (v: number) => (value = v) },
    {
      closedBy: 'any',
      resolveResult: (returnValue) => (returnValue === 'confirm' ? value : undefined)
    }
  );
}

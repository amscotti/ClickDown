import type { PropsWithChildren } from '@kitajs/html';

export function Modal({
  title,
  closeHandler,
  children,
}: PropsWithChildren<{ title: string; closeHandler?: string }>) {
  return (
    <dialog aria-labelledby="modal-title">
      <article>
        <header>
          <h3 safe id="modal-title">
            {title}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onclick={
              closeHandler ||
              "const dialog = this.closest('dialog'); dialog.close(); dialog.remove();"
            }
          ></button>
        </header>
        {children}
      </article>
    </dialog>
  );
}

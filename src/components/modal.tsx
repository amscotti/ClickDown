import type { PropsWithChildren } from '@kitajs/html';

export function Modal({
  title,
  closeMode = 'remove',
  children,
}: PropsWithChildren<{ title: string; closeMode?: 'remove' | 'flush' }>) {
  return (
    <dialog aria-labelledby="modal-title">
      <article>
        <header>
          <h3 safe id="modal-title">
            {title}
          </h3>
          <button
            type="button"
            class="close"
            aria-label="Close"
            data-modal-close={closeMode}
          ></button>
        </header>
        {children}
      </article>
    </dialog>
  );
}

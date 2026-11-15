import type { PropsWithChildren } from '@kitajs/html';

export function InlineError({ message, style }: { message: string; style?: string }) {
  return (
    <p class="inline-error" role="alert" style={style} safe>
      {message}
    </p>
  );
}

/** Synchronously render an escaped inline error paragraph for non-async validators. */
export function renderInlineError(message: string, style?: string): string {
  const html = <InlineError message={message} style={style} />;
  if (typeof html !== 'string') {
    throw new Error('InlineError unexpectedly returned a Promise');
  }
  return html;
}

export function ErrorArticle({
  message,
  showBackButton = false,
}: {
  message: string;
  showBackButton?: boolean;
}) {
  return (
    <article class="error-message">
      <InlineError message={message} />
      {showBackButton ? (
        <button type="button" data-action="history-back" class="secondary">
          Go Back
        </button>
      ) : null}
    </article>
  );
}

export function ErrorPage({ error }: PropsWithChildren<{ error?: string }>) {
  const isNotFound = typeof error === 'string' && error.includes('not found');
  return (
    <div class="grid" style="place-items: center; min-height: 60vh;">
      <div style="text-align: center; max-width: 600px;">
        <hgroup>
          <h1>Oops!</h1>
          <h2 safe>{error || 'Something went wrong'}</h2>
        </hgroup>
        <p>
          {isNotFound
            ? "The page you're looking for doesn't exist."
            : 'An unexpected error occurred. Please try again later.'}
        </p>
        <a href="/">Go Home</a>
      </div>
    </div>
  );
}

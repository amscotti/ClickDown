import type { PropsWithChildren } from '@kitajs/html';

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

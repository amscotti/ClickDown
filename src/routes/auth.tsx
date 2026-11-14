import { Layout } from '../components/layout';
import { LandingPage } from '../components/pages/landing';
import { LoginPage } from '../components/pages/login';
import { RegisterPage } from '../components/pages/register';
import { getSessionFromRequest } from '../middleware/auth';
import { disconnectSessionConnections } from '../realtime/handlers';
import { loginSchema, registerSchema } from '../schemas';
import { userService } from '../services/user.service';
import { parseCookie } from '../utils/cookie';
import { safeRedirectPath } from '../utils/html';
import {
  clearSessionCookie,
  clientIp,
  inlineErrorResponse,
  parseFormData,
  setSessionCookie,
} from '../utils/http';
import { logError } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { validateBody } from '../utils/validation';

export async function handleAuthRoutes(
  req: Request,
  url: URL,
  method: string
): Promise<Response | null> {
  // Home page
  if (url.pathname === '/' && method === 'GET') {
    const user = getSessionFromRequest(req);
    if (user) {
      return new Response('', {
        status: 302,
        headers: { Location: '/dashboard' },
      });
    }
    const html = await (
      <Layout title="Welcome">
        <LandingPage />
      </Layout>
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Register page
  if (url.pathname === '/register' && method === 'GET') {
    const user = getSessionFromRequest(req);
    if (user) {
      return new Response('', {
        status: 302,
        headers: { Location: '/dashboard' },
      });
    }
    const html = await (
      <Layout title="Register" scripts={['/js/forms.js']}>
        <RegisterPage />
      </Layout>
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Register submission
  if (url.pathname === '/register' && method === 'POST') {
    if (!checkRateLimit(`register:${clientIp(req)}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }
    try {
      const data = await parseFormData(req);
      const input = validateBody(data, registerSchema);
      if (input instanceof Response) return input;

      const result = await userService.register({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      });
      const isHtmx = req.headers.get('HX-Request') === 'true';

      if (isHtmx) {
        return new Response('', {
          status: 200,
          headers: {
            'HX-Redirect': '/dashboard',
            'Set-Cookie': setSessionCookie(result.sessionId),
          },
        });
      }

      return new Response('', {
        status: 302,
        headers: {
          Location: '/dashboard',
          'Set-Cookie': setSessionCookie(result.sessionId),
        },
      });
    } catch (error) {
      logError('auth', error);
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      return inlineErrorResponse(errorMessage, { headers: { 'HX-Reswap': 'innerHTML' } });
    }
  }

  // Login page
  if (url.pathname === '/login' && method === 'GET') {
    const user = getSessionFromRequest(req);
    const redirectTo = safeRedirectPath(url.searchParams.get('redirect'));
    if (user) {
      return new Response('', {
        status: 302,
        headers: { Location: redirectTo },
      });
    }
    const html = await (
      <Layout title="Login">
        <LoginPage redirectTo={redirectTo} />
      </Layout>
    );
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Login submission
  if (url.pathname === '/login' && method === 'POST') {
    if (!checkRateLimit(`login:${clientIp(req)}`)) {
      return new Response('Too many attempts. Please try again later.', { status: 429 });
    }
    try {
      const data = await parseFormData(req);
      const input = validateBody(data, loginSchema);
      if (input instanceof Response) return input;

      const result = await userService.login(input.email, input.password);
      const isHtmx = req.headers.get('HX-Request') === 'true';
      const redirectTo = safeRedirectPath(data.redirect);

      if (isHtmx) {
        return new Response('', {
          status: 200,
          headers: {
            'HX-Redirect': redirectTo,
            'Set-Cookie': setSessionCookie(result.sessionId),
          },
        });
      }

      return new Response('', {
        status: 302,
        headers: {
          Location: redirectTo,
          'Set-Cookie': setSessionCookie(result.sessionId),
        },
      });
    } catch (error) {
      logError('auth', error);
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      return inlineErrorResponse(errorMessage, { headers: { 'HX-Reswap': 'innerHTML' } });
    }
  }

  // Logout
  if (url.pathname === '/logout' && method === 'POST') {
    const cookieHeader = req.headers.get('Cookie');
    const sessionId = parseCookie(cookieHeader, 'session_id');

    if (sessionId) {
      userService.deleteSession(sessionId);
      disconnectSessionConnections(sessionId);
    }

    return new Response('', {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': clearSessionCookie(),
      },
    });
  }

  return null;
}

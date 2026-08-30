/**
 * The merchant session cookie.
 *
 * Its own module because a Next route file may only export request handlers, and both the
 * session route and the settlement proxy need to agree on the name and the options. Two
 * copies of these would drift, and the drift would show up as a session that silently
 * stops being sent.
 */
export const SESSION_COOKIE = "africred_session";

/** Matches the API's own session lifetime; a cookie outliving its session helps nobody. */
export const SESSION_MAX_AGE_SECONDS = 12 * 3600;

export function sessionCookieOptions() {
  return {
    // The token never reaches JavaScript, so a script injected into the page has nothing
    // to steal and neither does an extension.
    httpOnly: true,
    // Lax rather than strict: arriving from an email link keeps the session, while a
    // cross-site POST still cannot carry it.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

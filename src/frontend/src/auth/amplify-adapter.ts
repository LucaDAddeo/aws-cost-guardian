/**
 * Thin adapter around @aws-amplify/auth to isolate the dependency.
 * This allows the rest of the app to work even if Amplify has build issues,
 * and makes it easy to swap auth providers.
 */

export interface AuthSession {
  accessToken: string | null;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export interface SignInResult {
  isSignedIn: boolean;
}

/**
 * Sign in with email and password.
 */
export async function amplifySignIn(email: string, password: string): Promise<SignInResult> {
  const { signIn } = await import('@aws-amplify/auth');
  const result = await signIn({ username: email, password });
  return { isSignedIn: result.isSignedIn };
}

/**
 * Sign out the current user.
 */
export async function amplifySignOut(): Promise<void> {
  const { signOut } = await import('@aws-amplify/auth');
  await signOut();
}

/**
 * Fetch the current auth session (tokens).
 */
export async function amplifyFetchSession(): Promise<AuthSession> {
  const { fetchAuthSession } = await import('@aws-amplify/auth');
  const session = await fetchAuthSession();
  return {
    accessToken: session.tokens?.accessToken?.toString() ?? null,
  };
}

/**
 * Get the current authenticated user.
 */
export async function amplifyGetCurrentUser(): Promise<AuthUser> {
  const { getCurrentUser } = await import('@aws-amplify/auth');
  const user = await getCurrentUser();
  return {
    userId: user.userId,
    email: user.signInDetails?.loginId ?? '',
  };
}

import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "webgram-creativejudge-secret-2026"
);

const ALLOWED_DOMAIN = "@webgram.jp";
const SHARED_PASSWORD = "webgram111";
const COOKIE_NAME = "cj_session";
const EXPIRES_IN = "7d";

export { COOKIE_NAME };

export function isValidCredentials(email: string, password: string): boolean {
  return email.endsWith(ALLOWED_DOMAIN) && password === SHARED_PASSWORD;
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { email: payload.email as string };
  } catch {
    return null;
  }
}

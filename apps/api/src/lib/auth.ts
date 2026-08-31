import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";

const secret = new TextEncoder().encode(config.jwtSecret);

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string,
  };
}

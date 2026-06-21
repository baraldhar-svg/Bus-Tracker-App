import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, webauthnChallengesTable, tenantsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const router = Router();

function extractRp(req: import("express").Request): { rpId: string; expectedOrigin: string } {
  const origin = (req.headers.origin as string) ?? `https://${req.headers.host ?? "localhost"}`;
  let rpId = "localhost";
  try {
    rpId = new URL(origin).hostname;
  } catch { /* keep localhost */ }
  return { rpId, expectedOrigin: origin };
}

async function getUserWithTenant(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  let tenant = null;
  if (user.tenantId) {
    const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, user.tenantId)).limit(1);
    tenant = t ?? null;
  }
  return { ...user, tenant };
}

// POST /api/auth/webauthn/register-options
router.post("/register-options", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) return res.status(400).json({ error: "phone required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { rpId } = extractRp(req);

  const options = await generateRegistrationOptions({
    rpName: "OrbitTrack",
    rpID: rpId,
    userName: user.phone,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: user.biometricCredentialId
      ? [{ id: user.biometricCredentialId }]
      : [],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  });

  await db.insert(webauthnChallengesTable).values({
    challenge: options.challenge,
    userId: user.id,
    expiresAt: new Date(Date.now() + 90_000),
  });

  return res.json(options);
});

// POST /api/auth/webauthn/register-verify
router.post("/register-verify", async (req, res) => {
  const { phone, response } = req.body as { phone?: string; response?: unknown };
  if (!phone || !response) return res.status(400).json({ error: "phone and response required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const [challengeRow] = await db
    .select()
    .from(webauthnChallengesTable)
    .where(and(eq(webauthnChallengesTable.userId, user.id), gt(webauthnChallengesTable.expiresAt, new Date())))
    .limit(1);

  if (!challengeRow) return res.status(400).json({ error: "Challenge not found or expired" });

  const { rpId, expectedOrigin } = extractRp(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpId,
    });
  } catch (err: unknown) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Verification failed" });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "Registration not verified" });
  }

  const { credential } = verification.registrationInfo;
  const credentialIdStr = (response as Record<string, unknown>).id as string;
  const publicKeyStr = Buffer.from(credential.publicKey).toString("base64url");

  await db.update(usersTable).set({
    biometricEnabled: true,
    biometricCredentialId: credentialIdStr,
    biometricPublicKey: publicKeyStr,
    biometricCounter: credential.counter,
  }).where(eq(usersTable.id, user.id));

  await db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.id, challengeRow.id));

  const full = await getUserWithTenant(user.id);
  return res.json({ verified: true, user: full, credentialId: credentialIdStr });
});

// POST /api/auth/webauthn/login-options
router.post("/login-options", async (req, res) => {
  const { credentialId } = req.body as { credentialId?: string };
  const { rpId } = extractRp(req);

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials: credentialId
      ? [{ id: credentialId }]
      : [],
    userVerification: "required",
  });

  await db.insert(webauthnChallengesTable).values({
    challenge: options.challenge,
    userId: null,
    expiresAt: new Date(Date.now() + 90_000),
  });

  return res.json(options);
});

// POST /api/auth/webauthn/login-verify
router.post("/login-verify", async (req, res) => {
  const { response } = req.body as { response?: unknown };
  if (!response) return res.status(400).json({ error: "response required" });

  const assertion = response as Record<string, unknown>;
  const credentialId = assertion.id as string;

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.biometricCredentialId, credentialId))
    .limit(1);

  if (!user?.biometricEnabled || !user.biometricPublicKey) {
    return res.status(401).json({ error: "Biometric not registered for this device" });
  }

  const [challengeRow] = await db
    .select()
    .from(webauthnChallengesTable)
    .where(gt(webauthnChallengesTable.expiresAt, new Date()))
    .limit(1);

  if (!challengeRow) return res.status(400).json({ error: "Challenge expired. Retry." });

  const { rpId, expectedOrigin } = extractRp(req);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: challengeRow.challenge,
      expectedOrigin,
      expectedRPID: rpId,
      credential: {
        id: credentialId,
        publicKey: Buffer.from(user.biometricPublicKey, "base64url"),
        counter: user.biometricCounter ?? 0,
      },
    });
  } catch (err: unknown) {
    return res.status(401).json({ error: err instanceof Error ? err.message : "Authentication failed" });
  }

  if (!verification.verified) return res.status(401).json({ error: "Authentication failed" });

  await db.update(usersTable)
    .set({ biometricCounter: verification.authenticationInfo.newCounter })
    .where(eq(usersTable.id, user.id));

  await db.delete(webauthnChallengesTable).where(eq(webauthnChallengesTable.id, challengeRow.id));

  const full = await getUserWithTenant(user.id);
  return res.json({ verified: true, user: full });
});

// POST /api/auth/webauthn/disable
router.post("/disable", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) return res.status(400).json({ error: "phone required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  await db.update(usersTable).set({
    biometricEnabled: false,
    biometricCredentialId: null,
    biometricPublicKey: null,
    biometricCounter: 0,
  }).where(eq(usersTable.id, user.id));

  return res.json({ disabled: true });
});

export default router;

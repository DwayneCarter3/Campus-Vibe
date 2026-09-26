import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { Readable } from "stream";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  matricClaimsTable,
  uploadedMediaTable,
  usersTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";
import { hasAdminPrivileges } from "../lib/privilege";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const HOURLY_LIMIT_MS = 60 * 60 * 1000;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

function rateLimitClaimAction(action: "upload" | "submit", limit: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${action}:${clerkId(req)}`;
    const now = Date.now();
    let window = requestWindows.get(key);
    if (!window || now - window.startedAt >= HOURLY_LIMIT_MS) {
      window = { startedAt: now, count: 0 };
    }
    if (window.count >= limit) {
      res.setHeader("Retry-After", String(Math.ceil((window.startedAt + HOURLY_LIMIT_MS - now) / 1000)));
      res.status(429).json({ error: "Claim request rate limit exceeded. Please try again later." });
      return;
    }
    window.count += 1;
    requestWindows.set(key, window);
    if (requestWindows.size > 10000) {
      for (const [entryKey, entry] of requestWindows) {
        if (now - entry.startedAt >= HOURLY_LIMIT_MS) requestWindows.delete(entryKey);
      }
      if (requestWindows.size > 10000) requestWindows.delete(requestWindows.keys().next().value as string);
    }
    next();
  };
}

const uploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  contentType: z.enum(EVIDENCE_TYPES),
  documentType: z.enum(["student-id", "course-form"]),
});

const claimSubmissionSchema = z.object({
  matricNumber: z.string().trim().min(1).max(100),
  institution: z.string().trim().min(1).max(200),
  evidenceObjectPath: z.string().regex(/^\/objects\/[A-Za-z0-9/_-]+$/).max(500),
});

function clerkId(req: Request): string {
  return (req as any).userId as string;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only." });
    return false;
  }
  return true;
}

function hasValidEvidenceSignature(contentType: string, bytes: Buffer): boolean {
  if (contentType === "application/pdf") {
    return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (contentType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.subarray(0, 4).toString("ascii") === "RIFF"
      && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

router.post("/matric-claims/uploads/request-url", requireAuth, rateLimitClaimAction("upload", 5), async (req: Request, res: Response): Promise<void> => {
  const parsed = uploadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a supported document type, MIME type, and file size up to 10 MB." });
    return;
  }

  try {
    const { name, size, contentType, documentType } = parsed.data;
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    await db.insert(uploadedMediaTable).values({
      objectPath,
      uploaderId: clerkId(req),
      purpose: "matric-claim-evidence",
      declaredContentType: contentType,
      declaredSize: size,
      evidenceDocumentType: documentType,
    });
    res.status(201).json({ uploadURL, objectPath, expiresInSeconds: 900, metadata: { name, size, contentType, documentType } });
  } catch (error) {
    req.log.error({ err: error }, "Failed to issue matric claim evidence upload URL");
    res.status(500).json({ error: "Failed to issue evidence upload URL" });
  }
});

router.post("/matric-claims", requireAuth, rateLimitClaimAction("submit", 3), async (req: Request, res: Response): Promise<void> => {
  const parsed = claimSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid claim details or evidence object path." });
    return;
  }

  try {
    const claimantClerkId = clerkId(req);
    const { matricNumber, institution, evidenceObjectPath } = parsed.data;
    const normalizedMatric = matricNumber.replace(/\s+/g, "").toUpperCase();
    const normalizedInstitution = institution.trim().replace(/\s+/g, " ").toLowerCase();
    const matchingAccounts = await db
      .select({
        id: usersTable.id,
        clerkUserId: usersTable.clerkUserId,
        matricNumber: usersTable.matricNumber,
        school: usersTable.school,
      })
      .from(usersTable)
      .where(and(
        sql`upper(regexp_replace(trim(${usersTable.matricNumber}), '[[:space:]]+', '', 'g')) = ${normalizedMatric}`,
        sql`lower(regexp_replace(trim(${usersTable.school}), '[[:space:]]+', ' ', 'g')) = ${normalizedInstitution}`,
      ))
      .limit(2);

    if (matchingAccounts.length > 1) {
      res.status(409).json({ error: "Multiple accounts match the normalized institution and matric number; manual review is required." });
      return;
    }
    const target = matchingAccounts[0];
    if (!target) {
      res.status(404).json({ error: "Existing account not found." });
      return;
    }
    if (target.clerkUserId === claimantClerkId) {
      res.status(400).json({ error: "You cannot submit a claim against your own account." });
      return;
    }
    const [openClaim] = await db
      .select({ id: matricClaimsTable.id })
      .from(matricClaimsTable)
      .where(and(
        eq(matricClaimsTable.claimantClerkId, claimantClerkId),
        eq(matricClaimsTable.existingAccountId, target.id),
        eq(matricClaimsTable.status, "pending"),
      ))
      .limit(1);
    if (openClaim) {
      res.status(409).json({ error: "You already have a pending claim for this account." });
      return;
    }

    const [upload] = await db
      .select()
      .from(uploadedMediaTable)
      .where(and(
        eq(uploadedMediaTable.objectPath, evidenceObjectPath),
        eq(uploadedMediaTable.uploaderId, claimantClerkId),
        eq(uploadedMediaTable.purpose, "matric-claim-evidence"),
      ))
      .limit(1);
    if (
      !upload
      || !upload.declaredContentType
      || !upload.declaredSize
      || !EVIDENCE_TYPES.includes(upload.declaredContentType as typeof EVIDENCE_TYPES[number])
      || !["student-id", "course-form"].includes(upload.evidenceDocumentType ?? "")
    ) {
      res.status(400).json({ error: "Evidence must be uploaded using your claim evidence upload URL." });
      return;
    }

    const objectFile = await objectStorage.getObjectEntityFile(evidenceObjectPath);
    const [metadata] = await objectFile.getMetadata();
    const actualSize = Number(metadata.size);
    const actualType = metadata.contentType;
    const [signatureBytes] = await objectFile.download({ start: 0, end: 11 });
    if (
      actualSize < 1
      || actualSize > MAX_EVIDENCE_BYTES
      || actualSize !== upload.declaredSize
      || actualType !== upload.declaredContentType
      || !hasValidEvidenceSignature(upload.declaredContentType, signatureBytes)
    ) {
      res.status(400).json({ error: "Uploaded evidence does not match its declared type or size." });
      return;
    }

    const [claim] = await db.insert(matricClaimsTable).values({
      claimantClerkId,
      existingAccountId: target.id,
      matricNumber: target.matricNumber,
      institution: target.school,
      evidenceType: upload.evidenceDocumentType!,
      evidenceObjectPath,
    }).returning({
      id: matricClaimsTable.id,
      status: matricClaimsTable.status,
      createdAt: matricClaimsTable.createdAt,
    });
    res.status(201).json(claim);
  } catch (error) {
    req.log.error({ err: error }, "Failed to submit matric claim");
    res.status(500).json({ error: "Failed to submit claim" });
  }
});

router.get("/matric-claims/mine", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const claims = await db
      .select({
        id: matricClaimsTable.id,
        matricNumber: matricClaimsTable.matricNumber,
        institution: matricClaimsTable.institution,
        evidenceType: matricClaimsTable.evidenceType,
        status: matricClaimsTable.status,
        adminDecision: matricClaimsTable.adminDecision,
        adminDecisionNote: matricClaimsTable.adminDecisionNote,
        decidedAt: matricClaimsTable.decidedAt,
        createdAt: matricClaimsTable.createdAt,
        updatedAt: matricClaimsTable.updatedAt,
      })
      .from(matricClaimsTable)
      .where(eq(matricClaimsTable.claimantClerkId, clerkId(req)))
      .orderBy(desc(matricClaimsTable.createdAt));
    res.json({ claims });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load claimant's matric claim statuses");
    res.status(500).json({ error: "Failed to load claim statuses" });
  }
});

router.get("/admin/matric-claims", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const status = req.query.status;
    if (status !== undefined && status !== "pending" && status !== "approved" && status !== "rejected") {
      res.status(400).json({ error: "Status must be pending, approved, or rejected." });
      return;
    }
    const claims = await db
      .select({
        id: matricClaimsTable.id,
        claimantClerkId: matricClaimsTable.claimantClerkId,
        existingAccountId: matricClaimsTable.existingAccountId,
        matricNumber: matricClaimsTable.matricNumber,
        institution: matricClaimsTable.institution,
        evidenceType: matricClaimsTable.evidenceType,
        evidenceObjectPath: matricClaimsTable.evidenceObjectPath,
        status: matricClaimsTable.status,
        adminDecision: matricClaimsTable.adminDecision,
        adminDecisionNote: matricClaimsTable.adminDecisionNote,
        decidedByClerkId: matricClaimsTable.decidedByClerkId,
        decidedAt: matricClaimsTable.decidedAt,
        createdAt: matricClaimsTable.createdAt,
        updatedAt: matricClaimsTable.updatedAt,
      })
      .from(matricClaimsTable)
      .where(status ? eq(matricClaimsTable.status, status) : undefined)
      .orderBy(desc(matricClaimsTable.createdAt));
    res.json({ claims });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load admin matric claims");
    res.status(500).json({ error: "Failed to load claims" });
  }
});

router.patch("/admin/matric-claims/:claimId/decision", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const rawId = Array.isArray(req.params.claimId) ? req.params.claimId[0] : req.params.claimId;
  const claimId = Number(rawId);
  const parsed = z.object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(2000).optional(),
  }).safeParse(req.body);
  if (!Number.isSafeInteger(claimId) || claimId < 1 || !parsed.success) {
    res.status(400).json({ error: "Provide a valid claim id, decision, and optional note up to 2000 characters." });
    return;
  }

  try {
    const now = new Date();
    const [updated] = await db
      .update(matricClaimsTable)
      .set({
        status: parsed.data.decision,
        adminDecision: parsed.data.decision,
        adminDecisionNote: parsed.data.note ?? null,
        decidedByClerkId: clerkId(req),
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(matricClaimsTable.id, claimId), eq(matricClaimsTable.status, "pending")))
      .returning({
        id: matricClaimsTable.id,
        status: matricClaimsTable.status,
        adminDecision: matricClaimsTable.adminDecision,
        adminDecisionNote: matricClaimsTable.adminDecisionNote,
        decidedByClerkId: matricClaimsTable.decidedByClerkId,
        decidedAt: matricClaimsTable.decidedAt,
      });
    if (!updated) {
      const [exists] = await db.select({ id: matricClaimsTable.id }).from(matricClaimsTable).where(eq(matricClaimsTable.id, claimId)).limit(1);
      res.status(exists ? 409 : 404).json({ error: exists ? "Claim has already been decided." : "Claim not found." });
      return;
    }
    // A decision records the review only; it never changes or transfers account ownership.
    res.json(updated);
  } catch (error) {
    req.log.error({ err: error, claimId }, "Failed to resolve matric claim");
    res.status(500).json({ error: "Failed to resolve claim" });
  }
});

router.get("/matric-claims/:claimId/evidence", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rawId = Array.isArray(req.params.claimId) ? req.params.claimId[0] : req.params.claimId;
  const claimId = Number(rawId);
  if (!Number.isSafeInteger(claimId) || claimId < 1) {
    res.status(400).json({ error: "Invalid claim id." });
    return;
  }
  try {
    const [claim] = await db
      .select({
        claimantClerkId: matricClaimsTable.claimantClerkId,
        evidenceObjectPath: matricClaimsTable.evidenceObjectPath,
      })
      .from(matricClaimsTable)
      .where(eq(matricClaimsTable.id, claimId))
      .limit(1);
    if (!claim) {
      res.status(404).json({ error: "Claim evidence not found." });
      return;
    }
    const requester = clerkId(req);
    if (requester !== claim.claimantClerkId && !(await hasAdminPrivileges(req))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const file = await objectStorage.getObjectEntityFile(claim.evidenceObjectPath);
    const response = await objectStorage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", 'attachment; filename="claim-evidence"');
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error, claimId }, "Failed to serve matric claim evidence");
    res.status(500).json({ error: "Failed to serve claim evidence" });
  }
});

export default router;
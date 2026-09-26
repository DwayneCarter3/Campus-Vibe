import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { db, matricClaimsTable, uploadedMediaTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getAuth } from "@clerk/express";
import { hasAdminPrivileges } from "../lib/privilege";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const MAX_IMAGE_UPLOAD_BYTES = 80 * 1024;

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const uploaderId = (req as any).userId as string;
    const { name, size, contentType, purpose } = parsed.data;
    if (purpose && (contentType !== "image/webp" || size > MAX_IMAGE_UPLOAD_BYTES)) {
      res.status(400).json({ error: "Post and service images must be WebP files no larger than 80 KB." });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    await db.insert(uploadedMediaTable).values({
      objectPath,
      uploaderId,
      purpose: purpose ?? null,
      declaredContentType: contentType,
      declaredSize: size,
    });

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType, ...(purpose ? { purpose } : {}) },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    let isClaimEvidence = false;
    const [claimUpload] = await db
      .select({
        uploaderId: uploadedMediaTable.uploaderId,
      })
      .from(uploadedMediaTable)
      .where(and(
        eq(uploadedMediaTable.objectPath, objectPath),
        eq(uploadedMediaTable.purpose, "matric-claim-evidence"),
      ))
      .limit(1);
    if (claimUpload) {
      isClaimEvidence = true;
      const requesterId = ((req as any).userId ?? getAuth(req)?.userId) as string | undefined;
      if (!requesterId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as Request & { userId?: string }).userId = requesterId;
      const [linkedClaim] = await db
        .select({ claimantClerkId: matricClaimsTable.claimantClerkId })
        .from(matricClaimsTable)
        .where(eq(matricClaimsTable.evidenceObjectPath, objectPath))
        .limit(1);
      const isAdmin = await hasAdminPrivileges(req);
      const isClaimant = linkedClaim
        ? linkedClaim.claimantClerkId === requesterId
        : claimUpload.uploaderId === requesterId;
      if (!isAdmin && !isClaimant) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) {
    //   res.status(401).json({ error: "Unauthorized" });
    //   return;
    // }
    // const canAccess = await objectStorageService.canAccessObjectEntity({
    //   userId: req.user.id,
    //   objectFile,
    //   requestedPermission: ObjectPermission.READ,
    // });
    // if (!canAccess) {
    //   res.status(403).json({ error: "Forbidden" });
    //   return;
    // }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (isClaimEvidence) {
      res.setHeader("Content-Disposition", 'attachment; filename="claim-evidence"');
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;

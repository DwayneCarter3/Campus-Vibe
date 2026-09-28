import { Router } from "express";
import { eq, desc, and, ne, sql, inArray, like, or } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import * as dbModule from "@workspace/db";
import * as apiZodModule from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { CEO_EMAIL, hasAdminPrivileges } from "../lib/privilege.js";
import {
  isVerifiedAccount,
  publicDisplayRole,
  publicVerificationStatus,
} from "../lib/verification.js";
import { getEffectiveLevel } from "../lib/academic-level.js";
import {
  campusScopeCondition,
  canonicalInstitutionId,
  schoolScopeCondition,
} from "./list-scope.js";

const {
  db,
  servicesTable,
  usersTable,
  postsTable,
  notificationsTable,
  savedServicesTable,
  reportsTable,
} = dbModule as any;

const apiZod = apiZodModule as any;
const getSchema = (name: string) =>
  apiZod[name] || {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

const ListServicesQueryParams = getSchema("ListServicesQueryParams");
const ListServicesResponse = getSchema("ListServicesResponse");
const CreateServiceBody = getSchema("CreateServiceBody");
const GetServiceParams = getSchema("GetServiceParams");
const GetServiceResponse = getSchema("GetServiceResponse");
const UpdateServiceParams = getSchema("UpdateServiceParams");
const UpdateServiceBody = getSchema("UpdateServiceBody");
const UpdateServiceResponse = getSchema("UpdateServiceResponse");
const DeleteServiceParams = getSchema("DeleteServiceParams");
const ToggleSaveServiceParams = getSchema("ToggleSaveServiceParams");
const ReportServiceParams = getSchema("ReportServiceParams");

const router = Router() as any;

router.get("/services", async (req: any, res: any): Promise<void> => {
  const query = ListServicesQueryParams.safeParse(req.query);
  const limit =
    query.success && query.data?.limit ? Number(query.data.limit) : 50;
  const category = query.success ? query.data?.category : undefined;
  const search = query.success ? query.data?.search : undefined;

  const clerkUserId = getAuth(req).userId;
  let viewerUser: any = null;
  if (clerkUserId) {
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);
    viewerUser = u ?? null;
  }

  const conditions: any[] = [];
  if (category) {
    conditions.push(eq(servicesTable.category, category));
  }
  if (search) {
    conditions.push(
      or(
        like(servicesTable.title, `%${search}%`),
        like(servicesTable.description, `%${search}%`),
      ),
    );
  }

  if (viewerUser && viewerUser.role !== "system" && !viewerUser.isAdmin) {
    conditions.push(
      schoolScopeCondition(
        usersTable.institutionId,
        usersTable.school,
        viewerUser,
      ),
    );
    conditions.push(
      campusScopeCondition(
        usersTable.campusLocation,
        viewerUser.campusLocation,
      ),
    );
  }

  const services = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      pricing: servicesTable.pricing,
      contactWhatsapp: servicesTable.contactWhatsapp,
      contactPhone: servicesTable.contactPhone,
      contactEmail: servicesTable.contactEmail,
      imagesUrl: servicesTable.imagesUrl,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerUsername: usersTable.username,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerMatricNumber: usersTable.matricNumber,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerRole: usersTable.role,
      providerVerificationStatus: usersTable.verificationStatus,
      providerPublicBadgeTier: usersTable.publicBadgeTier,
      providerPublicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(and(...conditions) as any)
    .orderBy(desc(servicesTable.createdAt))
    .limit(limit);

  const servicesWithMeta = await Promise.all(
    services.map(async (service: any) => {
      let isSavedByMe = false;
      if (clerkUserId) {
        const saves = await db
          .select()
          .from(savedServicesTable)
          .where(
            and(
              eq(savedServicesTable.serviceId, service.id),
              eq(savedServicesTable.userId, clerkUserId),
            ) as any,
          );
        isSavedByMe = saves.length > 0;
      }

      const role = service.providerRole ?? "student";
      const publicRole = publicDisplayRole(role);

      return {
        ...service,
        isOwnedByMe: Boolean(clerkUserId && clerkUserId === service.providerId),
        isSavedByMe,
        providerName: service.providerName ?? "Unknown",
        providerUsername: service.providerUsername ?? null,
        providerFaculty: service.providerFaculty ?? "Unknown",
        providerLevel: getEffectiveLevel(
          service.providerLevel,
          service.providerMatricNumber,
        ),
        providerCampusLocation: service.providerCampusLocation ?? "Ojo",
        providerAvatarUrl: service.providerAvatarUrl ?? null,
        providerRole: publicRole,
        providerIsVerified: isVerifiedAccount(
          service.providerVerificationStatus,
          role,
          service.providerPublicBadgeTier,
          service.providerPublicBadgeExpiresAt,
        ),
        providerVerificationStatus: publicVerificationStatus(
          service.providerVerificationStatus,
          role,
          service.providerPublicBadgeTier,
          service.providerPublicBadgeExpiresAt,
        ),
      };
    }),
  );

  res.setHeader("Cache-Control", "private, no-store");
  res.json(ListServicesResponse.parse({ services: servicesWithMeta }));
});

router.post(
  "/services",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const body = CreateServiceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [inserted] = await db
      .insert(servicesTable)
      .values({
        providerId: clerkUserId,
        title: body.data.title,
        description: body.data.description,
        category: body.data.category,
        pricing: body.data.pricing,
        contactWhatsapp: body.data.contactWhatsapp ?? null,
        contactPhone: body.data.contactPhone ?? null,
        contactEmail: body.data.contactEmail ?? null,
        imagesUrl: body.data.imagesUrl ?? [],
      })
      .returning();

    res.status(201).json({ service: inserted });
  },
);

router.get(
  "/services/:serviceId",
  async (req: any, res: any): Promise<void> => {
    const rawId = Array.isArray(req.params.serviceId)
      ? req.params.serviceId[0]
      : req.params.serviceId;
    const params = GetServiceParams.safeParse({ serviceId: rawId });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [service] = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.id, params.data.serviceId))
      .limit(1);

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json(GetServiceResponse.parse({ service }));
  },
);

router.patch(
  "/services/:serviceId",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const rawId = Array.isArray(req.params.serviceId)
      ? req.params.serviceId[0]
      : req.params.serviceId;
    const params = UpdateServiceParams.safeParse({ serviceId: rawId });
    const body = UpdateServiceBody.safeParse(req.body);

    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request parameters or body" });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    const [existing] = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.id, params.data.serviceId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    if (
      existing.providerId !== clerkUserId &&
      !(await hasAdminPrivileges(req))
    ) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    const [updated] = await db
      .update(servicesTable)
      .set({
        ...body.data,
        updatedAt: new Date(),
      })
      .where(eq(servicesTable.id, params.data.serviceId))
      .returning();

    res.json(UpdateServiceResponse.parse({ service: updated }));
  },
);

router.delete(
  "/services/:serviceId",
  requireAuth,
  async (req: any, res: any): Promise<void> => {
    const rawId = Array.isArray(req.params.serviceId)
      ? req.params.serviceId[0]
      : req.params.serviceId;
    const params = DeleteServiceParams.safeParse({ serviceId: rawId });
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const clerkUserId = getAuth(req).userId;
    const [existing] = await db
      .select()
      .from(servicesTable)
      .where(eq(servicesTable.id, params.data.serviceId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    if (
      existing.providerId !== clerkUserId &&
      !(await hasAdminPrivileges(req))
    ) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    await db
      .delete(servicesTable)
      .where(eq(servicesTable.id, params.data.serviceId));
    res.json({ success: true });
  },
);

export default router;

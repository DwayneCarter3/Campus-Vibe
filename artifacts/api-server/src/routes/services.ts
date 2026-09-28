import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { db, servicesTable, usersTable, postsTable, notificationsTable, savedServicesTable, reportsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { hasAdminPrivileges } from "../lib/privilege";
import { broadcastNotification } from "../sse-manager";
import { isVerifiedAccount, publicDisplayRole, publicVerificationStatus } from "../lib/verification";
import { getEffectiveLevel } from "../lib/academic-level";
import { computeCampusTitle } from "./admin";
import { ObjectStorageService } from "../lib/objectStorage";
import { cursorFilterHash, decodeFeedCursor, encodeFeedCursor } from "../lib/listCursor";
import { validateUploadedWebpImage } from "../lib/image-upload-validation";
import { isSmallWebpDataUrl } from "../lib/blur-data-url";
import {
  campusScopeCondition,
  normalizeCampusLocation,
  normalizeSchoolLabel,
  profilesShareCampus,
  profilesShareSchool,
  schoolScopeCondition,
  type CampusScopeProfile,
} from "./list-scope";
import {
  ListServicesQueryParams,
  ListServicesResponse,
  CreateServiceBody,
  GetServiceParams,
  GetServiceResponse,
  UpdateServiceParams,
  UpdateServiceBody,
  UpdateServiceResponse,
  DeleteServiceParams,
  ToggleSaveServiceParams,
  ToggleSaveServiceResponse,
  ReportServiceParams,
  ReportServiceBody,
  ToggleFeatureServiceParams,
  ToggleFeatureServiceResponse,
  PinServiceToProfileParams,
  PinServiceToProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const FLASH_SALE_DURATION_MS = 24 * 60 * 60 * 1000;
const objectStorageService = new ObjectStorageService();

async function getCampusScopeProfile(userId: string) {
  const [profile] = await db
    .select({
      institutionId: usersTable.institutionId,
      school: usersTable.school,
      campusLocation: usersTable.campusLocation,
    })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, userId));
  return profile ?? null;
}

function hasCampusScope(profile: CampusScopeProfile | null): profile is CampusScopeProfile {
  return Boolean(profile?.school.trim() && profile.campusLocation.trim());
}

function getPrivateServiceObjectPath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    let normalized = objectStorageService.normalizeObjectEntityPath(rawUrl);
    if (normalized.startsWith("/api/storage/objects/")) {
      normalized = normalized.slice("/api/storage".length);
    }
    if (!normalized.startsWith("/objects/")) return null;
    if (normalized.includes("?") || normalized.includes("#") || normalized.split("/").some((part) => part === "." || part === "..")) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

function hasMalformedPrivateServicePath(rawUrl: string): boolean {
  return (rawUrl.startsWith("/objects/") || rawUrl.startsWith("/api/storage/objects/"))
    && getPrivateServiceObjectPath(rawUrl) === null;
}

function normalizePrice(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const strippedCurrency = value.trim().replace(/^₦\s*/u, "");
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(strippedCurrency)) return null;
  const normalized = strippedCurrency.replaceAll(",", "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? normalized : null;
}

function normalizeFlashSale(
  price: string | null | undefined,
  originalPrice: string | null | undefined,
): { price: string; originalPrice: string } | null {
  const normalizedPrice = normalizePrice(price);
  const normalizedOriginalPrice = normalizePrice(originalPrice);
  if (
    normalizedPrice === null ||
    normalizedOriginalPrice === null ||
    Number(normalizedOriginalPrice) <= Number(normalizedPrice)
  ) {
    return null;
  }
  return { price: normalizedPrice, originalPrice: normalizedOriginalPrice };
}

async function getProviderTitle(providerId: string, role: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(eq(postsTable.authorId, providerId));
  return computeCampusTitle(publicDisplayRole(role), count ?? 0);
}

async function isServiceSaved(serviceId: number, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const [saved] = await db
    .select({ id: savedServicesTable.id })
    .from(savedServicesTable)
    .where(and(eq(savedServicesTable.serviceId, serviceId), eq(savedServicesTable.userId, userId)))
    .limit(1);
  return Boolean(saved);
}

async function buildServiceWithMeta(serviceId: number, viewerId?: string) {
  const [service] = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      imageUrl: servicesTable.imageUrl,
      blurDataUrl: servicesTable.blurDataUrl,
      price: servicesTable.price,
      originalPrice: servicesTable.originalPrice,
      isFlashSale: servicesTable.isFlashSale,
      flashExpiresAt: servicesTable.flashExpiresAt,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      isFeatured: servicesTable.isFeatured,
      isPinnedToProfile: servicesTable.isPinnedToProfile,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerMatricNumber: usersTable.matricNumber,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerVerificationStatus: usersTable.verificationStatus,
      providerRole: usersTable.role,
      providerPublicBadgeTier: usersTable.publicBadgeTier,
      providerPublicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(eq(servicesTable.id, serviceId));

  if (!service) return null;

  const {
    providerVerificationStatus, providerMatricNumber,
    providerPublicBadgeTier, providerPublicBadgeExpiresAt, ...rest
  } = service;
  const role = service.providerRole ?? "student";
  const publicRole = publicDisplayRole(role);

  return {
    ...rest,
    flashExpiresAt: service.flashExpiresAt?.toISOString() ?? null,
    providerName: service.providerName ?? "Unknown",
    providerFaculty: service.providerFaculty ?? "Unknown",
    providerLevel: getEffectiveLevel(service.providerLevel, providerMatricNumber),
    providerCampusLocation: service.providerCampusLocation ?? "Ojo",
    providerAvatarUrl: service.providerAvatarUrl ?? null,
    providerIsVerified: isVerifiedAccount(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
    providerVerificationStatus: publicVerificationStatus(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
    providerRole: publicRole,
    providerCampusTitle: await getProviderTitle(service.providerId, role),
    isSavedByMe: await isServiceSaved(serviceId, viewerId),
  };
}

router.get("/services", async (req, res): Promise<void> => {
  const savedOnlyQuery = req.query.savedOnly;
  if (savedOnlyQuery !== undefined && savedOnlyQuery !== "true" && savedOnlyQuery !== "false") {
    res.status(400).json({ error: "savedOnly must be true or false" });
    return;
  }
  const flashSaleQuery = req.query.flashSale;
  if (flashSaleQuery !== undefined && flashSaleQuery !== "true" && flashSaleQuery !== "false") {
    res.status(400).json({ error: "flashSale must be true or false" });
    return;
  }
  const params = ListServicesQueryParams.safeParse({
    ...req.query,
    savedOnly: undefined,
    flashSale: undefined,
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { limit, offset, category, cursor: cursorToken } = params.data;
  const savedOnly = savedOnlyQuery === "true";
  const flashSaleOnly = flashSaleQuery === "true";
  const viewerId = getAuth(req)?.userId;
  if (!viewerId) {
    res.status(401).json({ error: "Sign in to view campus services." });
    return;
  }
  const requesterProfile = await getCampusScopeProfile(viewerId);
  if (!hasCampusScope(requesterProfile)) {
    res.status(403).json({ error: "Complete your school and campus profile to view services." });
    return;
  }
  const scope: CampusScopeProfile = requesterProfile;
  const conditions = [
    eq(servicesTable.isActive, true),
    sql`(${servicesTable.isFlashSale} = false OR ${servicesTable.flashExpiresAt} > ${new Date()})`,
    schoolScopeCondition(usersTable.institutionId, usersTable.school, scope),
    campusScopeCondition(usersTable.campusLocation, scope.campusLocation),
  ];
  if (flashSaleOnly) {
    conditions.push(sql`${servicesTable.isFlashSale} = true AND ${servicesTable.flashExpiresAt} > ${new Date()}`);
  }
  if (category) {
    conditions.push(eq(servicesTable.category, category));
  }
  if (savedOnly && viewerId) {
    const savedRows = await db.select({ serviceId: savedServicesTable.serviceId })
      .from(savedServicesTable)
      .where(eq(savedServicesTable.userId, viewerId));
    conditions.push(inArray(servicesTable.id, savedRows.map((row) => row.serviceId)));
  }
  const filterHash = cursorFilterHash({
    category: category ?? null,
    savedOnly,
    flashSaleOnly,
    viewerId: savedOnly ? viewerId : null,
    institutionId: scope.institutionId,
    school: normalizeSchoolLabel(scope.school),
    campus: normalizeCampusLocation(scope.campusLocation),
  });
  if (cursorToken && offset > 0) {
    res.status(400).json({ error: "Cursor pagination cannot be combined with a positive offset." });
    return;
  }
  const cursor = cursorToken !== undefined ? decodeFeedCursor(cursorToken, filterHash) : null;
  if (cursorToken !== undefined && !cursor) {
    res.status(400).json({ error: "Invalid or filter-mismatched cursor." });
    return;
  }
  const cursorCondition = cursor ? sql`(
    ${servicesTable.isFeatured} < ${cursor.featured}
    OR (${servicesTable.isFeatured} = ${cursor.featured} AND ${servicesTable.createdAt} < ${cursor.createdAt}::timestamptz)
    OR (${servicesTable.isFeatured} = ${cursor.featured} AND ${servicesTable.createdAt} = ${cursor.createdAt}::timestamptz
      AND ${servicesTable.id} < ${cursor.id})
  )` : undefined;
  const pageConditions = cursorCondition ? [...conditions, cursorCondition] : conditions;

  const fetchedServices = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      imageUrl: servicesTable.imageUrl,
      blurDataUrl: servicesTable.blurDataUrl,
      price: servicesTable.price,
      originalPrice: servicesTable.originalPrice,
      isFlashSale: servicesTable.isFlashSale,
      flashExpiresAt: servicesTable.flashExpiresAt,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      isFeatured: servicesTable.isFeatured,
      isPinnedToProfile: servicesTable.isPinnedToProfile,
      createdAt: servicesTable.createdAt,
      cursorCreatedAt: sql<string>`to_char(${servicesTable.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerMatricNumber: usersTable.matricNumber,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerVerificationStatus: usersTable.verificationStatus,
      providerRole: usersTable.role,
      providerPublicBadgeTier: usersTable.publicBadgeTier,
      providerPublicBadgeExpiresAt: usersTable.publicBadgeExpiresAt,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(pageConditions.length === 1 ? pageConditions[0] : and(...pageConditions))
    .orderBy(desc(servicesTable.isFeatured), desc(servicesTable.createdAt), desc(servicesTable.id))
    .limit((limit ?? 20) + 1)
    .offset(cursor ? 0 : (offset ?? 0));

  const pageLimit = limit ?? 20;
  const hasMore = fetchedServices.length > pageLimit;
  const services = fetchedServices.slice(0, pageLimit);
  const lastService = services.at(-1);
  const nextCursor = hasMore && lastService
    ? encodeFeedCursor({
        featured: lastService.isFeatured ?? false,
        pinned: false,
        createdAt: lastService.cursorCreatedAt,
        id: lastService.id,
      }, filterHash)
    : null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  const enriched = await Promise.all(services.map(async (s) => {
    const {
      providerVerificationStatus, providerMatricNumber, cursorCreatedAt,
      providerPublicBadgeTier, providerPublicBadgeExpiresAt, ...rest
    } = s;
    const role = s.providerRole ?? "student";
    const publicRole = publicDisplayRole(role);
    return {
      ...rest,
      flashExpiresAt: s.flashExpiresAt?.toISOString() ?? null,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: getEffectiveLevel(s.providerLevel, providerMatricNumber),
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: isVerifiedAccount(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
      providerVerificationStatus: publicVerificationStatus(providerVerificationStatus, role, providerPublicBadgeTier, providerPublicBadgeExpiresAt),
      providerRole: publicRole,
      providerCampusTitle: await getProviderTitle(s.providerId, role),
      isSavedByMe: await isServiceSaved(s.id, viewerId ?? undefined),
    };
  }));

  res.json(ListServicesResponse.parse({ services: enriched, total: count, nextCursor }));
});

router.post("/services", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isSmallWebpDataUrl(parsed.data.blurDataUrl)) {
    res.status(400).json({ error: "blurDataUrl must be a small valid WebP data URL." });
    return;
  }
  if (
    parsed.data.blurDataUrl !== undefined &&
    (parsed.data.imageUrl === undefined || (parsed.data.blurDataUrl !== null && !parsed.data.imageUrl))
  ) {
    res.status(400).json({ error: "blurDataUrl can only be supplied with imageUrl." });
    return;
  }
  if (parsed.data.imageUrl && hasMalformedPrivateServicePath(parsed.data.imageUrl)) {
    res.status(400).json({ error: "Private media object paths must be valid /objects/ paths." });
    return;
  }
  const imagePath = getPrivateServiceObjectPath(parsed.data.imageUrl);
  if (imagePath) {
    const imageError = await validateUploadedWebpImage(imagePath, userId, "service-image", objectStorageService);
    if (imageError) {
      res.status(403).json({ error: imageError });
      return;
    }
  }

  const flashSale = parsed.data.isFlashSale
    ? normalizeFlashSale(parsed.data.price, parsed.data.originalPrice)
    : null;
  if (parsed.data.isFlashSale && !flashSale) {
    res.status(400).json({ error: "Flash sales require a positive price and an original price greater than the sale price" });
    return;
  }

  const { isFlashSale, ...serviceFields } = parsed.data;
  const [service] = await db
    .insert(servicesTable)
    .values(isFlashSale
      ? {
          ...serviceFields,
          price: flashSale!.price,
          providerId: userId,
          isFlashSale: true,
          originalPrice: flashSale!.originalPrice,
          flashExpiresAt: new Date(Date.now() + FLASH_SALE_DURATION_MS),
        }
      : {
          ...serviceFields,
          providerId: userId,
          isFlashSale: false,
          originalPrice: null,
          flashExpiresAt: null,
        })
    .returning();

  const result = await buildServiceWithMeta(service.id, userId);
  res.status(201).json(GetServiceResponse.parse(result));
});

router.get("/services/:serviceId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
  const params = GetServiceParams.safeParse({ serviceId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const viewerId = getAuth(req)?.userId;
  if (!viewerId) {
    res.status(401).json({ error: "Sign in to view this service." });
    return;
  }
  const [serviceScope] = await db
    .select({ providerId: servicesTable.providerId })
    .from(servicesTable)
    .where(eq(servicesTable.id, params.data.serviceId));
  if (!serviceScope) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const result = await buildServiceWithMeta(params.data.serviceId, getAuth(req)?.userId ?? undefined);
  if (
    !result ||
    (result.isFlashSale && (!result.flashExpiresAt || new Date(result.flashExpiresAt) <= new Date()))
  ) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const requesterProfile = await getCampusScopeProfile(viewerId);
  const isOwner = serviceScope.providerId === viewerId;
  if (!isOwner && !(await hasAdminPrivileges(req))) {
    if (!hasCampusScope(requesterProfile)) {
      res.status(403).json({ error: "Complete your school and campus profile to view this service." });
      return;
    }
    const providerProfile = await getCampusScopeProfile(serviceScope.providerId);
    if (
      !hasCampusScope(providerProfile) ||
      !profilesShareSchool(requesterProfile, providerProfile) ||
      !profilesShareCampus(requesterProfile, providerProfile)
    ) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
  }

  res.json(GetServiceResponse.parse(result));
});

router.patch("/services/:serviceId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
  const params = UpdateServiceParams.safeParse({ serviceId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isSmallWebpDataUrl(parsed.data.blurDataUrl)) {
    res.status(400).json({ error: "blurDataUrl must be a small valid WebP data URL." });
    return;
  }
  if (
    parsed.data.blurDataUrl !== undefined &&
    (parsed.data.imageUrl === undefined || (parsed.data.blurDataUrl !== null && !parsed.data.imageUrl))
  ) {
    res.status(400).json({ error: "blurDataUrl can only be supplied with imageUrl." });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  if (service.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (parsed.data.imageUrl !== undefined && parsed.data.imageUrl !== service.imageUrl) {
    if (parsed.data.imageUrl && hasMalformedPrivateServicePath(parsed.data.imageUrl)) {
      res.status(400).json({ error: "Private media object paths must be valid /objects/ paths." });
      return;
    }
    const imagePath = getPrivateServiceObjectPath(parsed.data.imageUrl);
    if (imagePath) {
      const imageError = await validateUploadedWebpImage(imagePath, userId, "service-image", objectStorageService);
      if (imageError) {
        res.status(403).json({ error: imageError });
        return;
      }
    }
  }

  const { isFlashSale: requestedFlashSale, originalPrice: requestedOriginalPrice, ...serviceFields } = parsed.data;
  const updateFields = parsed.data.imageUrl === null && parsed.data.blurDataUrl === undefined
    ? { ...serviceFields, blurDataUrl: null }
    : serviceFields;
  const now = new Date();
  if (requestedFlashSale === false) {
    await db.update(servicesTable).set({
      ...updateFields,
      isFlashSale: false,
      originalPrice: null,
      flashExpiresAt: null,
    }).where(eq(servicesTable.id, params.data.serviceId));
  } else {
    const nextIsFlashSale = requestedFlashSale ?? service.isFlashSale;
    if (nextIsFlashSale) {
      const nextPrice = parsed.data.price !== undefined ? parsed.data.price : service.price;
      const nextOriginalPrice = requestedOriginalPrice !== undefined ? requestedOriginalPrice : service.originalPrice;
      const flashSale = normalizeFlashSale(nextPrice, nextOriginalPrice);
      if (!flashSale) {
        res.status(400).json({ error: "Flash sales require a positive price and an original price greater than the sale price" });
        return;
      }
      const activeExpiry = service.isFlashSale && service.flashExpiresAt && service.flashExpiresAt > now;
      await db.update(servicesTable).set({
        ...updateFields,
        price: flashSale.price,
        isFlashSale: true,
        originalPrice: flashSale.originalPrice,
        flashExpiresAt: activeExpiry
          ? service.flashExpiresAt
          : new Date(now.getTime() + FLASH_SALE_DURATION_MS),
      }).where(eq(servicesTable.id, params.data.serviceId));
    } else {
      if (requestedOriginalPrice != null) {
        res.status(400).json({ error: "originalPrice can only be set on a flash sale" });
        return;
      }
      await db.update(servicesTable).set({
        ...updateFields,
        isFlashSale: false,
        originalPrice: null,
        flashExpiresAt: null,
      }).where(eq(servicesTable.id, params.data.serviceId));
    }
  }
  const result = await buildServiceWithMeta(params.data.serviceId, userId);
  res.json(UpdateServiceResponse.parse(result));
});

router.delete("/services/:serviceId", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
  const params = DeleteServiceParams.safeParse({ serviceId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  if (service.providerId !== userId && !(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  res.sendStatus(204);
});

router.post("/services/:serviceId/save", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleSaveServiceParams.safeParse({ serviceId: req.params.serviceId });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as any).userId as string;
  const [service] = await db.select({ id: servicesTable.id })
    .from(servicesTable).where(eq(servicesTable.id, parsed.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const [existing] = await db.select({ id: savedServicesTable.id })
    .from(savedServicesTable)
    .where(and(eq(savedServicesTable.serviceId, service.id), eq(savedServicesTable.userId, userId)))
    .limit(1);
  let saved: boolean;
  if (existing) {
    await db.delete(savedServicesTable).where(eq(savedServicesTable.id, existing.id));
    saved = false;
  } else {
    await db.insert(savedServicesTable).values({ serviceId: service.id, userId });
    saved = true;
  }
  res.json(ToggleSaveServiceResponse.parse({ saved }));
});

router.post("/services/:serviceId/report", requireAuth, async (req, res): Promise<void> => {
  const params = ReportServiceParams.safeParse({ serviceId: req.params.serviceId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ReportServiceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [service] = await db.select({ id: servicesTable.id })
    .from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const userId = (req as any).userId as string;
  const [existingReport] = await db.select({ id: reportsTable.id })
    .from(reportsTable)
    .where(and(eq(reportsTable.serviceId, service.id), eq(reportsTable.reporterId, userId)))
    .limit(1);
  if (existingReport) {
    res.status(409).json({ error: "You have already reported this service" });
    return;
  }
  try {
    await db.insert(reportsTable)
      .values({ serviceId: service.id, reporterId: userId, reason: body.data.reason });
  } catch (error) {
    const dbError = error as { code?: string; cause?: { code?: string } };
    if (dbError?.code === "23505" || dbError?.cause?.code === "23505") {
      res.status(409).json({ error: "You have already reported this service" });
      return;
    }
    throw error;
  }
  res.status(201).json({ reported: true });
});

router.patch("/services/:serviceId/feature", requireAuth, async (req, res): Promise<void> => {
  const params = ToggleFeatureServiceParams.safeParse({ serviceId: req.params.serviceId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as any).userId as string;
  if (!(await hasAdminPrivileges(req))) {
    res.status(403).json({ error: "Admin/CEO only" });
    return;
  }
  const [service] = await db.select({ isFeatured: servicesTable.isFeatured })
    .from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  const featured = !service.isFeatured;
  await db.update(servicesTable).set({ isFeatured: featured }).where(eq(servicesTable.id, params.data.serviceId));
  res.json(ToggleFeatureServiceResponse.parse({ featured }));
});

router.patch("/services/:serviceId/pin-profile", requireAuth, async (req, res): Promise<void> => {
  const params = PinServiceToProfileParams.safeParse({ serviceId: req.params.serviceId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as any).userId as string;
  const [service] = await db.select({ providerId: servicesTable.providerId, isPinnedToProfile: servicesTable.isPinnedToProfile })
    .from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }
  if (service.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const pinned = !service.isPinnedToProfile;
  await db.update(servicesTable).set({ isPinnedToProfile: pinned }).where(eq(servicesTable.id, params.data.serviceId));
  res.json(PinServiceToProfileResponse.parse({ pinned }));
});

router.post("/services/:serviceId/whatsapp-click", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
  const serviceId = parseInt(raw, 10);
  if (isNaN(serviceId) || serviceId <= 0) {
    res.status(400).json({ error: "Invalid service ID" });
    return;
  }
  const params = { data: { serviceId } };

  const [service] = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
    })
    .from(servicesTable)
    .where(eq(servicesTable.id, params.data.serviceId));

  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  const [notification] = await db
    .insert(notificationsTable)
    .values({
      userId: service.providerId,
      type: "whatsapp",
      actorName: null,
      message: `New interest in your hustle! 💰 (${service.title})`,
    })
    .returning();

  broadcastNotification(service.providerId, notification);

  res.json({ ok: true });
});

export default router;

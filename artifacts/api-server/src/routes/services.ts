import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, servicesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

async function buildServiceWithMeta(serviceId: number) {
  const [service] = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      price: servicesTable.price,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerMatricNumber: usersTable.matricNumber,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(eq(servicesTable.id, serviceId));

  if (!service) return null;

  const { providerMatricNumber, ...rest } = service;

  return {
    ...rest,
    providerName: service.providerName ?? "Unknown",
    providerFaculty: service.providerFaculty ?? "Unknown",
    providerLevel: service.providerLevel ?? "Unknown",
    providerCampusLocation: service.providerCampusLocation ?? "Ojo",
    providerAvatarUrl: service.providerAvatarUrl ?? null,
    providerIsVerified: !!(providerMatricNumber && providerMatricNumber.trim()),
  };
}

router.get("/services", async (req, res): Promise<void> => {
  const params = ListServicesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { limit, offset, category } = params.data;

  const conditions = [eq(servicesTable.isActive, true)];
  if (category) {
    conditions.push(eq(servicesTable.category, category));
  }

  const services = await db
    .select({
      id: servicesTable.id,
      providerId: servicesTable.providerId,
      title: servicesTable.title,
      description: servicesTable.description,
      category: servicesTable.category,
      price: servicesTable.price,
      contactInfo: servicesTable.contactInfo,
      isActive: servicesTable.isActive,
      createdAt: servicesTable.createdAt,
      providerName: usersTable.fullName,
      providerFaculty: usersTable.faculty,
      providerLevel: usersTable.level,
      providerCampusLocation: usersTable.campusLocation,
      providerAvatarUrl: usersTable.avatarUrl,
      providerMatricNumber: usersTable.matricNumber,
    })
    .from(servicesTable)
    .leftJoin(usersTable, eq(servicesTable.providerId, usersTable.clerkUserId))
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(servicesTable.createdAt))
    .limit(limit ?? 20)
    .offset(offset ?? 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(servicesTable)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  const enriched = services.map((s) => {
    const { providerMatricNumber, ...rest } = s;
    return {
      ...rest,
      providerName: s.providerName ?? "Unknown",
      providerFaculty: s.providerFaculty ?? "Unknown",
      providerLevel: s.providerLevel ?? "Unknown",
      providerCampusLocation: s.providerCampusLocation ?? "Ojo",
      providerAvatarUrl: s.providerAvatarUrl ?? null,
      providerIsVerified: !!(providerMatricNumber && providerMatricNumber.trim()),
    };
  });

  res.json(ListServicesResponse.parse({ services: enriched, total: count }));
});

router.post("/services", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).userId as string;
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [service] = await db
    .insert(servicesTable)
    .values({ ...parsed.data, providerId: userId })
    .returning();

  const result = await buildServiceWithMeta(service.id);
  res.status(201).json(GetServiceResponse.parse(result));
});

router.get("/services/:serviceId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.serviceId) ? req.params.serviceId[0] : req.params.serviceId;
  const params = GetServiceParams.safeParse({ serviceId: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await buildServiceWithMeta(params.data.serviceId);
  if (!result) {
    res.status(404).json({ error: "Service not found" });
    return;
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

  const [service] = await db.select().from(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  if (!service) {
    res.status(404).json({ error: "Service not found" });
    return;
  }

  if (service.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.update(servicesTable).set(parsed.data).where(eq(servicesTable.id, params.data.serviceId));
  const result = await buildServiceWithMeta(params.data.serviceId);
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

  if (service.providerId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(servicesTable).where(eq(servicesTable.id, params.data.serviceId));
  res.sendStatus(204);
});

export default router;

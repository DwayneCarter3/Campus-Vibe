import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import postsRouter from "./posts";
import pollsRouter from "./polls";
import servicesRouter from "./services";
import statsRouter from "./stats";
import notificationsRouter from "./notifications";
import schoolVotesRouter from "./school-votes";
import storageRouter from "./storage";
import adminRouter from "./admin";
import messagesRouter from "./messages";
import paymentsRouter from "./payments";
import reportsRouter from "./reports";
import shuttleStatusRouter from "./shuttle-status";
import cgpaPlanRouter from "./cgpa-plan";
import wazobiaRouter from "./wazobia";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(pollsRouter);
router.use(servicesRouter);
router.use(statsRouter);
router.use(notificationsRouter);
router.use(schoolVotesRouter);
router.use(storageRouter);
router.use(adminRouter);
router.use(messagesRouter);
router.use(paymentsRouter);
router.use(reportsRouter);
router.use(shuttleStatusRouter);
router.use(cgpaPlanRouter);
router.use(wazobiaRouter);

export default router;

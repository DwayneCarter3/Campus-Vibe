import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import postsRouter from "./posts";
import servicesRouter from "./services";
import statsRouter from "./stats";
import notificationsRouter from "./notifications";
import schoolVotesRouter from "./school-votes";
import storageRouter from "./storage";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(servicesRouter);
router.use(statsRouter);
router.use(notificationsRouter);
router.use(schoolVotesRouter);
router.use(storageRouter);
router.use(adminRouter);

export default router;

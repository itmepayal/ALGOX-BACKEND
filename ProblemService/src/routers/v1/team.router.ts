import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { teamController } from "../../controllers/team.controller";

const teamRouter = express.Router();

teamRouter.use(authenticateJwt);

teamRouter.post("/", teamController.createTeam.bind(teamController));
teamRouter.get("/me", teamController.getMyTeam.bind(teamController));
teamRouter.get("/invitations/me", teamController.getMyInvitations.bind(teamController));
teamRouter.post("/invitations/:id/accept", teamController.acceptInvitation.bind(teamController));
teamRouter.post("/invitations/:id/reject", teamController.rejectInvitation.bind(teamController));

teamRouter.get("/:id", teamController.getTeamById.bind(teamController));
teamRouter.post("/:id/invitations", teamController.inviteUser.bind(teamController));
teamRouter.post("/:id/leave", teamController.leaveTeam.bind(teamController));
teamRouter.delete("/:id/members/:userId", teamController.removeMember.bind(teamController));
teamRouter.patch("/:id/members/:userId/role", teamController.updateMemberRole.bind(teamController));
teamRouter.post("/:id/transfer-ownership", teamController.transferOwnership.bind(teamController));

export default teamRouter;

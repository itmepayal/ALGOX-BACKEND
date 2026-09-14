import mongoose, { Document, Schema } from "mongoose";
import type { Permission, UserRole } from "../rbac/permissions";

export interface IRolePermissionConfig extends Document {
  role: UserRole;
  permissions: Permission[];
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const rolePermissionSchema = new Schema<IRolePermissionConfig>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ["user", "moderator", "content_manager", "admin", "super_admin"],
      index: true,
    },
    permissions: [{ type: String }],
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export const RolePermissionConfig = mongoose.model<IRolePermissionConfig>(
  "RolePermissionConfig",
  rolePermissionSchema
);

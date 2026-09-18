import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";
import { Sheet, type SheetStatus } from "../models/sheet.model";
import { SheetSection } from "../models/sheetSection.model";
import { SheetTopic } from "../models/sheetTopic.model";
import { SheetProblem } from "../models/sheetProblem.model";
import { Problem } from "../models/problem.model";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../utils/errors/app.error";
import {
  FALLBACK_SHEETS,
  STRIVER_A2Z_SHEET_ID,
} from "../constants/sheets";
import axios from "axios";
import { serverConfig } from "../config";
import { invalidateFreeSheetProblemCache } from "../utils/sheetFreeAccess";

async function announceSheetPublished(sheetId: string, title: string) {
  try {
    const base = String(serverConfig.AUTH_SERVICE_URL || "http://localhost:3001").replace(
      /\/$/,
      ""
    );
    await axios.post(
      `${base}/api/v1/auth/admin/internal/announce-sheet`,
      { sheetId, title },
      {
        timeout: 3000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
        },
      }
    );
  } catch {
    /* non-blocking */
  }
}

export type ActorCtx = {
  userId: string;
  email?: string;
  authorization?: string;
  ip?: string;
  userAgent?: string;
};

export type SheetMeta = {
  id: string;
  name: string;
  totalProblems: number;
  status?: SheetStatus;
};

type CatalogJson = {
  name?: string;
  topics?: Array<{
    order?: number;
    name: string;
    problems?: Array<{ slug?: string; title?: string; difficulty?: string }>;
  }>;
};

function assertObjectId(id: string, label = "id"): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

function loadCatalogJson(): CatalogJson | null {
  const candidates = [
    path.join(process.cwd(), "scripts/data/dsa-best-sheet.json"),
    path.join(__dirname, "../../scripts/data/dsa-best-sheet.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    return JSON.parse(fs.readFileSync(file, "utf8")) as CatalogJson;
  }
  return null;
}

async function recountUniqueProblems(sheetId: string): Promise<number> {
  const ids = await SheetProblem.distinct("problem", { sheetId });
  const total = ids.length;
  await Sheet.updateOne({ sheetId }, { $set: { totalProblems: total } });
  return total;
}

async function applyOrder(
  model: typeof SheetSection | typeof SheetTopic | typeof SheetProblem,
  filterKey: string,
  filterValue: string | Types.ObjectId,
  orderedIds: string[]
) {
  const objectIds = orderedIds.map((id) => assertObjectId(id));
  const docs = await (model as any).find({
    [filterKey]: filterValue,
    _id: { $in: objectIds },
  });
  if (docs.length !== orderedIds.length) {
    throw new BadRequestError("One or more reorder ids are invalid for this parent");
  }
  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: assertObjectId(id), [filterKey]: filterValue },
      update: { $set: { order: index } },
    },
  }));
  await (model as any).bulkWrite(ops);
}

export class SheetService {
  async resolveSheetMeta(sheetId: string): Promise<SheetMeta | null> {
    const sheet = await Sheet.findOne({ sheetId }).lean();
    if (sheet) {
      return {
        id: sheet.sheetId,
        name: sheet.title,
        totalProblems: sheet.totalProblems,
        status: sheet.status,
      };
    }
    const fallback = (FALLBACK_SHEETS as Record<string, { id: string; name: string; totalProblems: number }>)[
      sheetId
    ];
    if (!fallback) return null;
    return {
      id: fallback.id,
      name: fallback.name,
      totalProblems: fallback.totalProblems,
    };
  }

  async listPublishedMetas(): Promise<SheetMeta[]> {
    const sheets = await Sheet.find({ status: "PUBLISHED" })
      .sort({ order: 1, title: 1 })
      .lean();
    if (sheets.length) {
      return sheets.map((s) => ({
        id: s.sheetId,
        name: s.title,
        totalProblems: s.totalProblems,
        status: s.status,
      }));
    }
    return Object.values(FALLBACK_SHEETS).map((s) => ({
      id: s.id,
      name: s.name,
      totalProblems: s.totalProblems,
      status: "PUBLISHED" as SheetStatus,
    }));
  }

  async getUniqueProblemIdSet(sheetId: string): Promise<Set<string>> {
    const ids = await SheetProblem.distinct("problem", { sheetId });
    return new Set(ids.map((id) => String(id)));
  }

  async listSheets(includeArchived = true) {
    const filter = includeArchived ? {} : { status: { $ne: "ARCHIVED" } };
    return Sheet.find(filter).sort({ order: 1, createdAt: -1 }).lean();
  }

  async getSheetBySheetId(sheetId: string) {
    const sheet = await Sheet.findOne({ sheetId }).lean();
    if (!sheet) throw new NotFoundError("Sheet not found");
    return sheet;
  }

  async createSheet(
    input: {
      sheetId: string;
      title: string;
      description?: string;
      order?: number;
      status?: SheetStatus;
      access?: "FREE" | "PREMIUM";
    },
    actor: ActorCtx
  ) {
    const sheetId = input.sheetId.trim().toLowerCase();
    const existing = await Sheet.findOne({ sheetId }).lean();
    if (existing) throw new ConflictError(`Sheet already exists: ${sheetId}`);

    const sheet = await Sheet.create({
      sheetId,
      title: input.title,
      description: input.description || "",
      order: input.order ?? 0,
      status: input.status || "DRAFT",
      access: input.access || "FREE",
      totalProblems: 0,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
    });

    // Default empty section so topics can be attached immediately.
    await SheetSection.create({
      sheet: sheet._id,
      sheetId,
      title: "Main",
      order: 0,
    });

    invalidateFreeSheetProblemCache();
    return sheet.toJSON();
  }

  async updateSheet(
    sheetId: string,
    input: {
      title?: string;
      description?: string;
      order?: number;
      access?: "FREE" | "PREMIUM";
    },
    actor: ActorCtx
  ) {
    const sheet = await Sheet.findOneAndUpdate(
      { sheetId },
      {
        $set: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.order !== undefined && { order: input.order }),
          ...(input.access !== undefined && { access: input.access }),
          updatedBy: actor.userId,
        },
      },
      { returnDocument: "after" }
    );
    if (!sheet) throw new NotFoundError("Sheet not found");
    invalidateFreeSheetProblemCache();
    return sheet.toJSON();
  }

  async setStatus(sheetId: string, status: SheetStatus, actor: ActorCtx) {
    const sheet = await Sheet.findOne({ sheetId });
    if (!sheet) throw new NotFoundError("Sheet not found");
    const wasPublished = sheet.status === "PUBLISHED";
    sheet.status = status;
    sheet.updatedBy = actor.userId;
    if (status === "PUBLISHED") sheet.publishedAt = new Date();
    await sheet.save();
    if (status === "PUBLISHED" && !wasPublished) {
      void announceSheetPublished(sheet.sheetId, sheet.title);
    }
    invalidateFreeSheetProblemCache();
    return sheet.toJSON();
  }

  async deleteSheet(sheetId: string) {
    const sheet = await Sheet.findOne({ sheetId });
    if (!sheet) throw new NotFoundError("Sheet not found");
    await Promise.all([
      SheetProblem.deleteMany({ sheetId }),
      SheetTopic.deleteMany({ sheetId }),
      SheetSection.deleteMany({ sheetId }),
      Sheet.deleteOne({ sheetId }),
    ]);
    invalidateFreeSheetProblemCache();
    return { sheetId, deleted: true };
  }

  async getPreview(sheetId: string) {
    const sheet = await this.getSheetBySheetId(sheetId);
    const sections = await SheetSection.find({ sheetId })
      .sort({ order: 1 })
      .lean();
    const topics = await SheetTopic.find({ sheetId }).sort({ order: 1 }).lean();
    const problems = await SheetProblem.find({ sheetId })
      .sort({ order: 1 })
      .populate("problem", "title slug difficulty status category")
      .lean();

    const topicsBySection = new Map<string, typeof topics>();
    for (const t of topics) {
      const key = String(t.section);
      if (!topicsBySection.has(key)) topicsBySection.set(key, []);
      topicsBySection.get(key)!.push(t);
    }
    const problemsByTopic = new Map<string, typeof problems>();
    for (const p of problems) {
      const key = String(p.topic);
      if (!problemsByTopic.has(key)) problemsByTopic.set(key, []);
      problemsByTopic.get(key)!.push(p);
    }

    return {
      ...sheet,
      id: String(sheet._id),
      sections: sections.map((sec) => ({
        ...sec,
        id: String(sec._id),
        topics: (topicsBySection.get(String(sec._id)) || []).map((topic) => ({
          ...topic,
          id: String(topic._id),
          problems: (problemsByTopic.get(String(topic._id)) || []).map((sp) => {
            const prob = sp.problem as any;
            return {
              id: String(sp._id),
              order: sp.order,
              problemId: prob?._id ? String(prob._id) : String(sp.problem),
              title: prob?.title,
              slug: prob?.slug,
              difficulty: prob?.difficulty,
              status: prob?.status,
              category: prob?.category,
            };
          }),
        })),
      })),
    };
  }

  // ── Sections ──────────────────────────────────────────────────────

  async createSection(
    sheetId: string,
    input: { title: string; order?: number }
  ) {
    const sheet = await Sheet.findOne({ sheetId });
    if (!sheet) throw new NotFoundError("Sheet not found");
    let order = input.order;
    if (order === undefined) {
      const last = await SheetSection.findOne({ sheetId })
        .sort({ order: -1 })
        .select("order")
        .lean();
      order = (last?.order ?? -1) + 1;
    }
    const section = await SheetSection.create({
      sheet: sheet._id,
      sheetId,
      title: input.title,
      order,
    });
    return section.toJSON();
  }

  async updateSection(
    sectionId: string,
    input: { title?: string; order?: number }
  ) {
    const section = await SheetSection.findByIdAndUpdate(
      assertObjectId(sectionId, "sectionId"),
      {
        $set: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.order !== undefined && { order: input.order }),
        },
      },
      { returnDocument: "after" }
    );
    if (!section) throw new NotFoundError("Section not found");
    return section.toJSON();
  }

  async reorderSections(sheetId: string, orderedIds: string[]) {
    await this.getSheetBySheetId(sheetId);
    await applyOrder(SheetSection, "sheetId", sheetId, orderedIds);
    return this.listSections(sheetId);
  }

  async listSections(sheetId: string) {
    return SheetSection.find({ sheetId }).sort({ order: 1 }).lean();
  }

  async deleteSection(sectionId: string) {
    const section = await SheetSection.findById(assertObjectId(sectionId, "sectionId"));
    if (!section) throw new NotFoundError("Section not found");
    const topics = await SheetTopic.find({ section: section._id }).select("_id");
    const topicIds = topics.map((t) => t._id);
    await SheetProblem.deleteMany({ topic: { $in: topicIds } });
    await SheetTopic.deleteMany({ section: section._id });
    await SheetSection.deleteOne({ _id: section._id });
    await recountUniqueProblems(section.sheetId);
    invalidateFreeSheetProblemCache();
    return { deleted: true, sectionId };
  }

  // ── Topics ────────────────────────────────────────────────────────

  async createTopic(
    sectionId: string,
    input: { title: string; order?: number }
  ) {
    const section = await SheetSection.findById(
      assertObjectId(sectionId, "sectionId")
    );
    if (!section) throw new NotFoundError("Section not found");
    let order = input.order;
    if (order === undefined) {
      const last = await SheetTopic.findOne({ section: section._id })
        .sort({ order: -1 })
        .select("order")
        .lean();
      order = (last?.order ?? -1) + 1;
    }
    const topic = await SheetTopic.create({
      section: section._id,
      sheetId: section.sheetId,
      title: input.title,
      order,
    });
    return topic.toJSON();
  }

  async updateTopic(
    topicId: string,
    input: { title?: string; order?: number }
  ) {
    const topic = await SheetTopic.findByIdAndUpdate(
      assertObjectId(topicId, "topicId"),
      {
        $set: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.order !== undefined && { order: input.order }),
        },
      },
      { returnDocument: "after" }
    );
    if (!topic) throw new NotFoundError("Topic not found");
    return topic.toJSON();
  }

  async reorderTopics(sectionId: string, orderedIds: string[]) {
    const section = await SheetSection.findById(
      assertObjectId(sectionId, "sectionId")
    );
    if (!section) throw new NotFoundError("Section not found");
    await applyOrder(SheetTopic, "section", section._id, orderedIds);
    return SheetTopic.find({ section: section._id }).sort({ order: 1 }).lean();
  }

  async deleteTopic(topicId: string) {
    const topic = await SheetTopic.findById(assertObjectId(topicId, "topicId"));
    if (!topic) throw new NotFoundError("Topic not found");
    await SheetProblem.deleteMany({ topic: topic._id });
    await SheetTopic.deleteOne({ _id: topic._id });
    await recountUniqueProblems(topic.sheetId);
    invalidateFreeSheetProblemCache();
    return { deleted: true, topicId };
  }

  // ── Problems (refs only) ──────────────────────────────────────────

  private async resolveProblemRef(input: {
    problemId?: string;
    slug?: string;
  }) {
    if (input.problemId) {
      const id = assertObjectId(input.problemId, "problemId");
      const problem = await Problem.findById(id).select("_id slug title").lean();
      if (!problem) throw new NotFoundError("Problem not found");
      return problem;
    }
    if (input.slug) {
      const problem = await Problem.findOne({
        slug: input.slug.trim().toLowerCase(),
      })
        .select("_id slug title")
        .lean();
      if (!problem) {
        throw new NotFoundError(`Problem not found for slug: ${input.slug}`);
      }
      return problem;
    }
    throw new BadRequestError("problemId or slug is required");
  }

  async attachProblem(
    topicId: string,
    input: { problemId?: string; slug?: string; order?: number }
  ) {
    const topic = await SheetTopic.findById(assertObjectId(topicId, "topicId"));
    if (!topic) throw new NotFoundError("Topic not found");
    const problem = await this.resolveProblemRef(input);

    const existing = await SheetProblem.findOne({
      topic: topic._id,
      problem: problem._id,
    }).lean();
    if (existing) {
      throw new ConflictError("Problem already attached to this topic");
    }

    let order = input.order;
    if (order === undefined) {
      const last = await SheetProblem.findOne({ topic: topic._id })
        .sort({ order: -1 })
        .select("order")
        .lean();
      order = (last?.order ?? -1) + 1;
    }

    const link = await SheetProblem.create({
      topic: topic._id,
      sheetId: topic.sheetId,
      problem: problem._id,
      order,
    });
    await recountUniqueProblems(topic.sheetId);
    invalidateFreeSheetProblemCache();
    return {
      ...link.toJSON(),
      problemId: String(problem._id),
      slug: problem.slug,
      title: problem.title,
    };
  }

  async bulkAttach(
    topicId: string,
    problems: Array<{ problemId?: string; slug?: string; order?: number }>
  ) {
    const topic = await SheetTopic.findById(assertObjectId(topicId, "topicId"));
    if (!topic) throw new NotFoundError("Topic not found");

    const last = await SheetProblem.findOne({ topic: topic._id })
      .sort({ order: -1 })
      .select("order")
      .lean();
    let nextOrder = (last?.order ?? -1) + 1;

    const attached: any[] = [];
    const skipped: Array<{ reason: string; problemId?: string; slug?: string }> =
      [];

    for (const item of problems) {
      try {
        const problem = await this.resolveProblemRef(item);
        const exists = await SheetProblem.findOne({
          topic: topic._id,
          problem: problem._id,
        }).lean();
        if (exists) {
          skipped.push({
            reason: "already_attached",
            problemId: String(problem._id),
            slug: problem.slug,
          });
          continue;
        }
        const order = item.order ?? nextOrder++;
        if (item.order === undefined) nextOrder = Math.max(nextOrder, order + 1);
        const link = await SheetProblem.create({
          topic: topic._id,
          sheetId: topic.sheetId,
          problem: problem._id,
          order,
        });
        attached.push({
          ...link.toJSON(),
          problemId: String(problem._id),
          slug: problem.slug,
          title: problem.title,
        });
      } catch (err: any) {
        skipped.push({
          reason: err?.message || "failed",
          problemId: item.problemId,
          slug: item.slug,
        });
      }
    }

    await recountUniqueProblems(topic.sheetId);
    invalidateFreeSheetProblemCache();
    return { attached, skipped, attachedCount: attached.length };
  }

  async reorderProblems(topicId: string, orderedIds: string[]) {
    const topic = await SheetTopic.findById(assertObjectId(topicId, "topicId"));
    if (!topic) throw new NotFoundError("Topic not found");
    await applyOrder(SheetProblem, "topic", topic._id, orderedIds);
    return SheetProblem.find({ topic: topic._id })
      .sort({ order: 1 })
      .populate("problem", "title slug difficulty")
      .lean();
  }

  async removeProblem(topicId: string, problemId: string) {
    const topic = await SheetTopic.findById(assertObjectId(topicId, "topicId"));
    if (!topic) throw new NotFoundError("Topic not found");
    if (!mongoose.isValidObjectId(problemId)) {
      throw new BadRequestError("Invalid problem id");
    }
    const oid = new Types.ObjectId(problemId);

    let deleted = await SheetProblem.findOneAndDelete({
      topic: topic._id,
      _id: oid,
    });
    if (!deleted) {
      deleted = await SheetProblem.findOneAndDelete({
        topic: topic._id,
        problem: oid,
      });
    }
    if (!deleted) throw new NotFoundError("Sheet problem link not found");
    await recountUniqueProblems(topic.sheetId);
    invalidateFreeSheetProblemCache();
    return { deleted: true, topicId, problemId };
  }

  /**
   * Upsert sheet structure from `scripts/data/dsa-best-sheet.json`.
   * References existing Problem docs by slug — never creates Problem duplicates.
   */
  async syncFromCatalog(options?: {
    sheetId?: string;
    publish?: boolean;
    actorId?: string;
  }) {
    const sheetId = (options?.sheetId || STRIVER_A2Z_SHEET_ID).toLowerCase();
    const catalog = loadCatalogJson();
    if (!catalog?.topics?.length) {
      throw new BadRequestError("DSA catalog JSON not found or empty");
    }

    const fallback = FALLBACK_SHEETS[STRIVER_A2Z_SHEET_ID];
    const title =
      sheetId === STRIVER_A2Z_SHEET_ID
        ? fallback.name
        : catalog.name || sheetId;
    const publish = options?.publish !== false;

    let sheet = await Sheet.findOne({ sheetId });
    if (!sheet) {
      sheet = await Sheet.create({
        sheetId,
        title,
        description:
          "Curated DSA learning path (NeetCode + Striver A2Z style). Synced from catalog JSON.",
        status: publish ? "PUBLISHED" : "DRAFT",
        order: 0,
        totalProblems: 0,
        createdBy: options?.actorId,
        updatedBy: options?.actorId,
        publishedAt: publish ? new Date() : null,
      });
    } else {
      sheet.title = title;
      sheet.updatedBy = options?.actorId;
      if (publish && sheet.status !== "PUBLISHED") {
        sheet.status = "PUBLISHED";
        sheet.publishedAt = new Date();
      }
      await sheet.save();
    }

    // Replace tree for deterministic sync (progress keys use sheetId string only).
    await SheetProblem.deleteMany({ sheetId });
    await SheetTopic.deleteMany({ sheetId });
    await SheetSection.deleteMany({ sheetId });

    const section = await SheetSection.create({
      sheet: sheet._id,
      sheetId,
      title: "DSA Topics",
      order: 0,
    });

    const allSlugs = new Set<string>();
    for (const topic of catalog.topics) {
      for (const p of topic.problems || []) {
        if (p.slug) allSlugs.add(p.slug.toLowerCase());
      }
    }

    const problems = await Problem.find({ slug: { $in: [...allSlugs] } })
      .select("_id slug")
      .lean();
    const bySlug = new Map(problems.map((p) => [p.slug, p]));

    let attached = 0;
    let missingSlugs: string[] = [];

    for (const topicEntry of catalog.topics) {
      const topic = await SheetTopic.create({
        section: section._id,
        sheetId,
        title: topicEntry.name,
        order: topicEntry.order ?? 0,
      });

      let order = 0;
      for (const p of topicEntry.problems || []) {
        if (!p.slug) continue;
        const problem = bySlug.get(p.slug.toLowerCase());
        if (!problem) {
          missingSlugs.push(p.slug);
          continue;
        }
        try {
          await SheetProblem.create({
            topic: topic._id,
            sheetId,
            problem: problem._id,
            order: order++,
          });
          attached += 1;
        } catch {
          // unique constraint on topic+problem — skip duplicates within topic
        }
      }
    }

    missingSlugs = [...new Set(missingSlugs)];
    const totalProblems = await recountUniqueProblems(sheetId);
    invalidateFreeSheetProblemCache();
    const refreshed = await Sheet.findOne({ sheetId }).lean();

    return {
      sheetId,
      title: refreshed?.title || title,
      status: refreshed?.status,
      access: (refreshed as any)?.access || "FREE",
      topicsSynced: catalog.topics.length,
      linksAttached: attached,
      totalProblems,
      missingSlugs,
      missingCount: missingSlugs.length,
    };
  }

  /** Boot helper: ensure striver-a2z exists (upsert from JSON if missing). */
  async ensureDefaultCatalogSeeded(): Promise<void> {
    const existing = await Sheet.findOne({
      sheetId: STRIVER_A2Z_SHEET_ID,
    }).lean();
    if (existing) {
      const linkCount = await SheetProblem.countDocuments({
        sheetId: STRIVER_A2Z_SHEET_ID,
      });
      if (linkCount > 0) return;
    }
    try {
      const result = await this.syncFromCatalog({
        sheetId: STRIVER_A2Z_SHEET_ID,
        publish: true,
        actorId: "system",
      });
      console.info("[SheetCatalog] seeded striver-a2z", {
        totalProblems: result.totalProblems,
        missingCount: result.missingCount,
      });
    } catch (err) {
      console.warn("[SheetCatalog] boot sync skipped:", (err as Error)?.message);
    }
  }
}

export const sheetService = new SheetService();

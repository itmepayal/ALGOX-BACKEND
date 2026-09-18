import { Post, IPost } from "../models/post.model";
import { Comment, IComment } from "../models/comment.model";
import redis from "../config/redis.config";
import { BadRequestError, ForbiddenError, NotFoundError } from "../utils/errors/app.error";

export class DiscussionRepository {
  async createPost(data: Partial<IPost>): Promise<IPost> {
    return await Post.create({
      ...data,
      status: data.status || "ACTIVE",
      isLocked: false,
    });
  }

  async getPosts(
    category?: string,
    problemId?: string,
    language?: string,
    companyTag?: string,
    searchQuery?: string,
    sortBy: "latest" | "most_upvoted" | "hot" = "latest",
    page: number = 1,
    limit: number = 10,
    opts?: { includeHidden?: boolean; status?: string }
  ) {
    const cacheKey = `posts:v2:cat:${category || "all"}:prob:${problemId || "all"}:lang:${language || "all"}:comp:${companyTag || "all"}:sort:${sortBy}:q:${searchQuery || "none"}:p:${page}:st:${opts?.status || "pub"}`;

    if (!opts?.includeHidden && !opts?.status) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return typeof cached === "string" ? JSON.parse(cached) : cached;
        }
      } catch {
        // Non-blocking
      }
    }

    const query: Record<string, unknown> = {};
    if (opts?.status) {
      query.status = opts.status;
    } else if (!opts?.includeHidden) {
      query.status = { $in: ["ACTIVE", "LOCKED"] };
    }
    if (category) query.category = category;
    if (problemId) query.problemId = problemId;
    if (language) query.language = language;
    if (companyTag) query.companyTags = companyTag;
    if (searchQuery) {
      query.$or = [
        { title: { $regex: searchQuery, $options: "i" } },
        { content: { $regex: searchQuery, $options: "i" } },
        { tags: { $regex: searchQuery, $options: "i" } },
      ];
    }

    let sort: Record<string, 1 | -1> = { isPinned: -1, createdAt: -1 };
    if (sortBy === "most_upvoted") sort = { isPinned: -1, upvotes: -1, createdAt: -1 };
    else if (sortBy === "hot") sort = { isPinned: -1, viewsCount: -1, upvotes: -1 };

    const skip = (page - 1) * limit;
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const [posts, total] = await Promise.all([
      Post.find(query).sort(sort).skip(skip).limit(safeLimit).lean(),
      Post.countDocuments(query),
    ]);

    const result = {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };

    if (!opts?.includeHidden && !opts?.status) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), { ex: 30 });
      } catch {
        // Non-blocking
      }
    }

    return result;
  }

  async getPostById(postId: string, opts?: { staff?: boolean }): Promise<IPost | null> {
    const post = await Post.findByIdAndUpdate(
      postId,
      { $inc: { viewsCount: 1 } },
      { returnDocument: "after" }
    );
    if (!post) return null;
    if (!opts?.staff && (post.status === "HIDDEN" || post.status === "DELETED")) {
      return null;
    }
    return post;
  }

  async updatePost(
    postId: string,
    userId: string,
    patch: Partial<Pick<IPost, "title" | "content" | "tags">>,
    isStaff: boolean
  ): Promise<IPost> {
    const post = await Post.findById(postId);
    if (!post || post.status === "DELETED") throw new NotFoundError("Post not found");
    if (!isStaff && post.authorId.toString() !== userId) {
      throw new ForbiddenError("You can only edit your own posts");
    }
    if (!isStaff && (post.isLocked || post.status === "LOCKED")) {
      throw new ForbiddenError("This discussion is locked");
    }
    if (patch.title !== undefined) post.title = patch.title;
    if (patch.content !== undefined) post.content = patch.content;
    if (patch.tags !== undefined) post.tags = patch.tags;
    await post.save();
    return post;
  }

  async softDeletePost(postId: string, userId: string, isStaff: boolean): Promise<IPost> {
    const post = await Post.findById(postId);
    if (!post || post.status === "DELETED") throw new NotFoundError("Post not found");
    if (!isStaff && post.authorId.toString() !== userId) {
      throw new ForbiddenError("You can only delete your own posts");
    }
    post.status = "DELETED";
    await post.save();
    return post;
  }

  async moderatePost(
    postId: string,
    action: "pin" | "unpin" | "lock" | "unlock" | "hide" | "restore" | "delete"
  ): Promise<IPost> {
    const post = await Post.findById(postId);
    if (!post) throw new NotFoundError("Post not found");

    switch (action) {
      case "pin":
        post.isPinned = true;
        break;
      case "unpin":
        post.isPinned = false;
        break;
      case "lock":
        post.isLocked = true;
        post.status = post.status === "HIDDEN" || post.status === "DELETED" ? post.status : "LOCKED";
        break;
      case "unlock":
        post.isLocked = false;
        if (post.status === "LOCKED") post.status = "ACTIVE";
        break;
      case "hide":
        post.status = "HIDDEN";
        break;
      case "restore":
        post.status = "ACTIVE";
        post.isLocked = false;
        break;
      case "delete":
        post.status = "DELETED";
        break;
      default:
        throw new BadRequestError("Invalid moderation action");
    }
    await post.save();
    return post;
  }

  async votePost(postId: string, userId: string, voteType: "upvote" | "downvote") {
    const post = await Post.findById(postId);
    if (!post || post.status === "DELETED" || post.status === "HIDDEN") {
      throw new NotFoundError("Post not found");
    }

    const hasUpvoted = post.upvotedBy.some((id) => id.toString() === userId);
    const hasDownvoted = post.downvotedBy.some((id) => id.toString() === userId);

    if (voteType === "upvote") {
      if (hasUpvoted) {
        post.upvotes -= 1;
        post.upvotedBy = post.upvotedBy.filter((id) => id.toString() !== userId);
      } else {
        post.upvotes += 1;
        post.upvotedBy.push(userId as any);
        if (hasDownvoted) {
          post.downvotes -= 1;
          post.downvotedBy = post.downvotedBy.filter((id) => id.toString() !== userId);
        }
      }
    } else {
      if (hasDownvoted) {
        post.downvotes -= 1;
        post.downvotedBy = post.downvotedBy.filter((id) => id.toString() !== userId);
      } else {
        post.downvotes += 1;
        post.downvotedBy.push(userId as any);
        if (hasUpvoted) {
          post.upvotes -= 1;
          post.upvotedBy = post.upvotedBy.filter((id) => id.toString() !== userId);
        }
      }
    }

    await post.save();
    return post;
  }

  async bookmarkPost(postId: string, userId: string) {
    const post = await Post.findById(postId);
    if (!post || post.status === "DELETED") throw new NotFoundError("Post not found");

    const isBookmarked = post.bookmarkedBy.some((id) => id.toString() === userId);

    if (isBookmarked) {
      post.bookmarksCount -= 1;
      post.bookmarkedBy = post.bookmarkedBy.filter((id) => id.toString() !== userId);
    } else {
      post.bookmarksCount += 1;
      post.bookmarkedBy.push(userId as any);
    }

    await post.save();
    return post;
  }

  async addComment(data: Partial<IComment>): Promise<IComment> {
    const post = await Post.findById(data.postId);
    if (!post || post.status === "DELETED" || post.status === "HIDDEN") {
      throw new NotFoundError("Post not found");
    }
    if (post.isLocked || post.status === "LOCKED") {
      throw new ForbiddenError("This discussion is locked");
    }
    const comment = await Comment.create({ ...data, status: "ACTIVE" });
    await Post.findByIdAndUpdate(data.postId, { $inc: { commentCount: 1 } });
    return comment;
  }

  async updateComment(
    commentId: string,
    userId: string,
    content: string,
    isStaff: boolean
  ): Promise<IComment> {
    const comment = await Comment.findById(commentId);
    if (!comment || comment.status === "DELETED") throw new NotFoundError("Comment not found");
    if (!isStaff && comment.authorId.toString() !== userId) {
      throw new ForbiddenError("You can only edit your own comments");
    }
    comment.content = content;
    await comment.save();
    return comment;
  }

  async softDeleteComment(
    commentId: string,
    userId: string,
    isStaff: boolean
  ): Promise<IComment> {
    const comment = await Comment.findById(commentId);
    if (!comment || comment.status === "DELETED") throw new NotFoundError("Comment not found");
    if (!isStaff && comment.authorId.toString() !== userId) {
      throw new ForbiddenError("You can only delete your own comments");
    }
    comment.status = "DELETED";
    await comment.save();
    await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -1 } });
    return comment;
  }

  async getCommentsByPostId(postId: string, staff = false): Promise<IComment[]> {
    const filter: Record<string, unknown> = { postId };
    if (!staff) filter.status = "ACTIVE";
    return await Comment.find(filter).sort({ createdAt: 1 });
  }
}

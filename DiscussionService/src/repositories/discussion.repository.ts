import { Post, IPost } from "../models/post.model";
import { Comment, IComment } from "../models/comment.model";
import redis from "../config/redis.config";

export class DiscussionRepository {
  async createPost(data: Partial<IPost>): Promise<IPost> {
    return await Post.create(data);
  }

  async getPosts(
    category?: string,
    problemId?: string,
    language?: string,
    companyTag?: string,
    searchQuery?: string,
    sortBy: "latest" | "most_upvoted" | "hot" = "latest",
    page: number = 1,
    limit: number = 10
  ) {
    const cacheKey = `posts:cat:${category || 'all'}:prob:${problemId || 'all'}:lang:${language || 'all'}:comp:${companyTag || 'all'}:sort:${sortBy}:q:${searchQuery || 'none'}:p:${page}`;

    // Redis Cache Check (30 sec TTL)
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    } catch {
      // Non-blocking
    }

    const query: any = {};
    if (category) query.category = category;
    if (problemId) query.problemId = problemId;
    if (language) query.language = language;
    if (companyTag) query.companyTags = companyTag;
    if (searchQuery) {
      query.$text = { $search: searchQuery };
    }

    let sort: any = { createdAt: -1 };
    if (sortBy === "most_upvoted") sort = { upvotes: -1, createdAt: -1 };
    else if (sortBy === "hot") sort = { viewsCount: -1, upvotes: -1 };

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      Post.find(query).sort(sort).skip(skip).limit(limit),
      Post.countDocuments(query),
    ]);

    const result = { posts, total, page, totalPages: Math.ceil(total / limit) };

    try {
      await redis.set(cacheKey, JSON.stringify(result), { ex: 30 });
    } catch {
      // Non-blocking
    }

    return result;
  }

  async getPostById(postId: string): Promise<IPost | null> {
    const post = await Post.findByIdAndUpdate(
      postId,
      { $inc: { viewsCount: 1 } },
      { new: true }
    );
    return post;
  }

  async votePost(postId: string, userId: string, voteType: "upvote" | "downvote") {
    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

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
    if (!post) throw new Error("Post not found");

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
    const comment = await Comment.create(data);
    await Post.findByIdAndUpdate(data.postId, { $inc: { commentCount: 1 } });
    return comment;
  }

  async getCommentsByPostId(postId: string): Promise<IComment[]> {
    return await Comment.find({ postId }).sort({ createdAt: 1 });
  }
}

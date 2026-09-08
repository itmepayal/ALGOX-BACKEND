import { DiscussionRepository } from "../repositories/discussion.repository";
import { IPost } from "../models/post.model";
import { IComment } from "../models/comment.model";

export class DiscussionService {
  constructor(private discussionRepository: DiscussionRepository) {}

  async createPost(data: Partial<IPost>) {
    return await this.discussionRepository.createPost(data);
  }

  async getPosts(
    category?: string,
    problemId?: string,
    language?: string,
    companyTag?: string,
    searchQuery?: string,
    sortBy?: "latest" | "most_upvoted" | "hot",
    page?: number,
    limit?: number
  ) {
    return await this.discussionRepository.getPosts(
      category,
      problemId,
      language,
      companyTag,
      searchQuery,
      sortBy,
      page,
      limit
    );
  }

  async getPostById(postId: string) {
    const post = await this.discussionRepository.getPostById(postId);
    if (!post) throw new Error("Post not found");
    return post;
  }

  async votePost(postId: string, userId: string, voteType: "upvote" | "downvote") {
    return await this.discussionRepository.votePost(postId, userId, voteType);
  }

  async bookmarkPost(postId: string, userId: string) {
    return await this.discussionRepository.bookmarkPost(postId, userId);
  }

  async addComment(data: Partial<IComment>) {
    return await this.discussionRepository.addComment(data);
  }

  async getComments(postId: string) {
    return await this.discussionRepository.getCommentsByPostId(postId);
  }
}

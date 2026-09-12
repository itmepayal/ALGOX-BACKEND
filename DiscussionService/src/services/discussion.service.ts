import { DiscussionRepository } from "../repositories/discussion.repository";
import { IPost } from "../models/post.model";
import { IComment } from "../models/comment.model";
import { isStaffRole } from "../rbac/permissions";
import { NotFoundError } from "../utils/errors/app.error";

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
    limit?: number,
    opts?: { includeHidden?: boolean; status?: string }
  ) {
    return await this.discussionRepository.getPosts(
      category,
      problemId,
      language,
      companyTag,
      searchQuery,
      sortBy,
      page,
      limit,
      opts
    );
  }

  async getPostById(postId: string, staff = false) {
    const post = await this.discussionRepository.getPostById(postId, { staff });
    if (!post) throw new NotFoundError("Post not found");
    return post;
  }

  async updatePost(
    postId: string,
    userId: string,
    role: string | undefined,
    patch: Partial<Pick<IPost, "title" | "content" | "tags">>
  ) {
    return this.discussionRepository.updatePost(
      postId,
      userId,
      patch,
      isStaffRole(role)
    );
  }

  async deletePost(postId: string, userId: string, role: string | undefined) {
    return this.discussionRepository.softDeletePost(postId, userId, isStaffRole(role));
  }

  async moderate(
    postId: string,
    action: "pin" | "unpin" | "lock" | "unlock" | "hide" | "restore" | "delete"
  ) {
    return this.discussionRepository.moderatePost(postId, action);
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

  async updateComment(
    commentId: string,
    userId: string,
    role: string | undefined,
    content: string
  ) {
    return this.discussionRepository.updateComment(
      commentId,
      userId,
      content,
      isStaffRole(role)
    );
  }

  async deleteComment(commentId: string, userId: string, role: string | undefined) {
    return this.discussionRepository.softDeleteComment(
      commentId,
      userId,
      isStaffRole(role)
    );
  }

  async getComments(postId: string, staff = false) {
    return await this.discussionRepository.getCommentsByPostId(postId, staff);
  }
}

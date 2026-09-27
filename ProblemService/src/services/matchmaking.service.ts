import { Types } from "mongoose";
import { Battle, type BattleDifficulty } from "../models/battle.model";
import { BattleParticipant } from "../models/battleParticipant.model";
import { UserSnapshot } from "../models/user.model";
import {
  // BadRequestError,
  NotFoundError,
  ConflictError,
} from "../utils/errors/app.error";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import { getRedisClient, isRedisConnected, memoryQueueStore } from "../config/redis.config";
import logger from "../config/logger.config";

export interface MatchmakingQueueEntry {
  userId: string;
  userName: string;
  userEmail: string;
  difficulty: BattleDifficulty;
  topic: string;
  battleMode: string;
  joinedAt: string;
  expiresAt: number;
}

export interface JoinQueueDto {
  difficulty?: BattleDifficulty;
  topic?: string;
  battleMode?: string;
}

const QUEUE_TTL_SECONDS = 60;

export class MatchmakingService {
  /**
   * Join the matchmaking queue and attempt atomic matching.
   */
  async joinQueue(
    user: { id: string; name: string; email: string },
    dto: JoinQueueDto
  ) {
    const uid = new Types.ObjectId(user.id);

    // 1. Verify user is active and exists
    const userSnap = await UserSnapshot.findById(user.id).lean();
    if (!userSnap || (userSnap as any).deletedAt) {
      throw new NotFoundError("User account not found or inactive.");
    }

    // 2. Active Battle Protection: Reject if already participating in an active battle
    const activeBattle = await Battle.findOne({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: { $in: ["ACCEPTED", "WAITING", "READY", "ACTIVE"] },
    });

    if (activeBattle) {
      throw new ConflictError(
        `You are already participating in an active battle (${activeBattle._id.toString()}).`
      );
    }

    const difficulty: BattleDifficulty = [
      "easy",
      "medium",
      "hard",
      "mixed",
    ].includes(dto.difficulty as string)
      ? (dto.difficulty as BattleDifficulty)
      : "medium";

    const topic = (dto.topic || "any").trim().toLowerCase();
    const battleMode = (dto.battleMode || "unranked").trim().toLowerCase();

    const now = Date.now();
    const entry: MatchmakingQueueEntry = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      difficulty,
      topic,
      battleMode,
      joinedAt: new Date(now).toISOString(),
      expiresAt: now + QUEUE_TTL_SECONDS * 1000,
    };

    // 3. Atomically check for compatible opponent in queue
    const matchedOpponent = await this.findCompatibleOpponent(entry);

    if (matchedOpponent) {
      // Opponent found! Atomically remove opponent & user from queue
      const opponentRemoved = await this.removeFromQueue(matchedOpponent.userId);
      await this.removeFromQueue(user.id);

      if (!opponentRemoved) {
        // Opponent was claimed concurrently by another worker!
        // Re-queue current user and continue searching
        await this.addToQueue(entry);
        return {
          status: "SEARCHING",
          queueEntry: entry,
        };
      }

      const battle = await this.createMatchedBattle(entry, matchedOpponent);

      logger.info("MATCHMAKING MATCH CREATED", {
        battleId: battle._id.toString(),
        playerA: user.id,
        playerB: matchedOpponent.userId,
        difficulty,
      });

      return {
        status: "MATCHED",
        battleId: battle._id.toString(),
        battle,
      };
    }

    // 4. No opponent found yet -> Store user in searching queue
    await this.addToQueue(entry);

    logger.info("MATCHMAKING QUEUE JOINED", {
      userId: user.id,
      difficulty,
      topic,
    });

    emitRealtimeEvent({
      event: "matchmaking:searching",
      userId: user.id,
      room: `user:${user.id}`,
      payload: {
        userId: user.id,
        difficulty,
        topic,
        joinedAt: entry.joinedAt,
      },
    });

    return {
      status: "SEARCHING",
      queueEntry: entry,
    };
  }

  /**
   * Cancel searching matchmaking queue.
   */
  async cancelQueue(userId: string) {
    await this.removeFromQueue(userId);

    logger.info("MATCHMAKING QUEUE CANCELLED", { userId });

    emitRealtimeEvent({
      event: "matchmaking:cancelled",
      userId,
      room: `user:${userId}`,
      payload: { userId },
    });

    return {
      success: true,
      message: "Matchmaking search cancelled.",
    };
  }

  /**
   * Get current matchmaking/battle status for authenticated user.
   */
  async getStatus(userId: string) {
    const uid = new Types.ObjectId(userId);

    // Check if in active battle
    const activeBattle = await Battle.findOne({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: { $in: ["ACCEPTED", "WAITING", "READY", "ACTIVE"] },
    }).lean();

    if (activeBattle) {
      return {
        status: "IN_BATTLE",
        battleId: activeBattle._id.toString(),
        battleStatus: activeBattle.status,
      };
    }

    // Check if in searching queue
    const queueEntry = await this.getQueueEntry(userId);
    if (queueEntry && queueEntry.expiresAt > Date.now()) {
      return {
        status: "SEARCHING",
        queueEntry,
      };
    }

    return {
      status: "IDLE",
    };
  }

  /**
   * Find a compatible searching user from Redis/memory queue.
   */
  private async findCompatibleOpponent(
    entry: MatchmakingQueueEntry
  ): Promise<MatchmakingQueueEntry | null> {
    const now = Date.now();
    const redis = getRedisClient();

    if (isRedisConnected() && redis) {
      const keys = await redis.keys("matchmaking:user:*");
      for (const key of keys) {
        const data = await redis.get(key);
        if (!data) continue;
        try {
          const opponent: MatchmakingQueueEntry = JSON.parse(data);
          if (opponent.userId === entry.userId) continue;
          if (opponent.expiresAt <= now) {
            await redis.del(key);
            continue;
          }
          if (this.isCompatible(entry, opponent)) {
            return opponent;
          }
        } catch {
          /* ignore parse error */
        }
      }
    } else {
      for (const [uid, stored] of memoryQueueStore.entries()) {
        if (uid === entry.userId) continue;
        if (stored.expiresAt <= now) {
          memoryQueueStore.delete(uid);
          continue;
        }
        if (this.isCompatible(entry, stored.entry)) {
          return stored.entry;
        }
      }
    }

    return null;
  }

  /**
   * Match compatibility check.
   */
  private isCompatible(
    a: MatchmakingQueueEntry,
    b: MatchmakingQueueEntry
  ): boolean {
    if (a.battleMode !== b.battleMode) return false;

    // Difficulty compatibility: same difficulty or either is 'mixed'
    const diffMatch =
      a.difficulty === "mixed" ||
      b.difficulty === "mixed" ||
      a.difficulty === b.difficulty;

    if (!diffMatch) return false;

    // Topic compatibility: same topic or either is 'any'
    const topicMatch =
      a.topic === "any" || b.topic === "any" || a.topic === b.topic;

    return topicMatch;
  }

  /**
   * Create production Battle V1 document from matched participants.
   */
  private async createMatchedBattle(
    playerA: MatchmakingQueueEntry,
    playerB: MatchmakingQueueEntry
  ) {
    const difficulty: BattleDifficulty =
      playerA.difficulty !== "mixed"
        ? playerA.difficulty
        : playerB.difficulty !== "mixed"
          ? playerB.difficulty
          : "medium";

    const battle = await Battle.create({
      creatorId: new Types.ObjectId(playerA.userId),
      creatorName: playerA.userName,
      creatorEmail: playerA.userEmail,
      opponentId: new Types.ObjectId(playerB.userId),
      opponentName: playerB.userName,
      opponentEmail: playerB.userEmail,
      status: "ACCEPTED", // Auto-accepted upon match!
      difficulty,
      problemCount: 3,
      durationSeconds: 1800,
    });

    // Move to WAITING for lobby ready check
    battle.status = "WAITING";
    await battle.save();

    await BattleParticipant.create([
      {
        battleId: battle._id,
        userId: new Types.ObjectId(playerA.userId),
        connectionStatus: "CONNECTED",
        joinedAt: new Date(),
      },
      {
        battleId: battle._id,
        userId: new Types.ObjectId(playerB.userId),
        connectionStatus: "CONNECTED",
        joinedAt: new Date(),
      },
    ]);

    const payload = {
      battleId: battle._id.toString(),
      status: "WAITING",
      creator: { id: playerA.userId, name: playerA.userName },
      opponent: { id: playerB.userId, name: playerB.userName },
      difficulty,
      problemCount: 3,
      durationSeconds: 1800,
    };

    // Notify Player A
    emitRealtimeEvent({
      event: "matchmaking:matched",
      userId: playerA.userId,
      room: `user:${playerA.userId}`,
      payload,
    });

    // Notify Player B
    emitRealtimeEvent({
      event: "matchmaking:matched",
      userId: playerB.userId,
      room: `user:${playerB.userId}`,
      payload,
    });

    // Notify Battle room
    emitRealtimeEvent({
      event: "battle:accepted",
      room: `battle:${battle._id.toString()}`,
      payload,
    });

    return battle;
  }

  /**
   * Save user into active searching queue.
   */
  private async addToQueue(entry: MatchmakingQueueEntry) {
    const redis = getRedisClient();
    if (isRedisConnected() && redis) {
      await redis.set(
        `matchmaking:user:${entry.userId}`,
        JSON.stringify(entry),
        "EX",
        QUEUE_TTL_SECONDS
      );
    } else {
      memoryQueueStore.set(entry.userId, {
        entry,
        expiresAt: entry.expiresAt,
      });
    }
  }

  /**
   * Remove user from active searching queue. Returns true if removed, false if already absent.
   */
  private async removeFromQueue(userId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (isRedisConnected() && redis) {
      const deletedCount = await redis.del(`matchmaking:user:${userId}`);
      return deletedCount > 0;
    }
    return memoryQueueStore.delete(userId);
  }

  /**
   * Get queue entry for a searching user.
   */
  private async getQueueEntry(
    userId: string
  ): Promise<MatchmakingQueueEntry | null> {
    const redis = getRedisClient();
    if (isRedisConnected() && redis) {
      const data = await redis.get(`matchmaking:user:${userId}`);
      if (data) {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      }
    } else {
      const stored = memoryQueueStore.get(userId);
      if (stored && stored.expiresAt > Date.now()) {
        return stored.entry;
      }
    }
    return null;
  }
}

export const matchmakingService = new MatchmakingService();

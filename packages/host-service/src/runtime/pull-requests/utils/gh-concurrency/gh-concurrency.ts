import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";

/**
 * How many `gh` children a PR refresh may run at once. A refresh fans out over
 * projects, branches, and PR details; on a host with ~100 projects that spawned
 * hundreds of processes in the same tick, and each one then raced the 10s
 * deadline on a machine that could no longer start it.
 */
export const GH_CALL_CONCURRENCY = 4;

/** Background sweeps lose their place when the gate closes; probes keep theirs. */
type GhCallLane = "background" | "probe";

/**
 * A FIFO of `gh` calls. Queued calls wait for a slot before they start, so the
 * caller's 10s deadline covers the call itself, not the wait.
 */
export class GhCallLimiter {
	private active = 0;
	private readonly waiting: Array<{
		lane: GhCallLane;
		resolve: () => void;
		reject: (error: Error) => void;
	}> = [];

	constructor(
		private readonly run: ExecGh,
		private readonly limit: number,
		/** Runs on a rejection before the slot is handed on. */
		private readonly onFailure?: (error: unknown) => void,
	) {}

	/**
	 * Fails every background call still waiting for a slot. The availability
	 * gate calls this when it closes, so a sweep that queued before the hold
	 * cannot keep spawning children against a dead network. Probes keep their
	 * place: a user refresh is the one call that can reopen the gate.
	 */
	drain(error: Error): void {
		const kept: typeof this.waiting = [];
		for (const waiter of this.waiting) {
			if (waiter.lane === "probe") kept.push(waiter);
			else waiter.reject(error);
		}
		this.waiting.splice(0, this.waiting.length, ...kept);
	}

	private acquire(lane: GhCallLane): Promise<void> {
		if (this.active < this.limit) {
			this.active++;
			return Promise.resolve();
		}
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this.waiting.push({ lane, resolve, reject });
		return promise;
	}

	// The freed slot goes straight to the next waiter; only an empty queue
	// drops the count, so no later caller can take a slot twice.
	private release(): void {
		const next = this.waiting.shift();
		if (next) next.resolve();
		else this.active--;
	}

	private inLane(lane: GhCallLane): ExecGh {
		return async (args, options) => {
			await this.acquire(lane);
			try {
				return await this.run(args, options);
			} catch (error) {
				// The gate must see the failure before this slot moves on, or the
				// next queued call starts against a network already known to be down.
				this.onFailure?.(error);
				throw error;
			} finally {
				this.release();
			}
		};
	}

	exec: ExecGh = this.inLane("background");
	probe: ExecGh = this.inLane("probe");
}

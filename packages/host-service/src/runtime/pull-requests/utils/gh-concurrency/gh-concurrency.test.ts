import { describe, expect, test } from "bun:test";
import type { ExecGh } from "../../../../trpc/router/workspace-creation/utils/exec-gh";
import { GhCallLimiter } from "./gh-concurrency";

// Lets every resume that a release triggers run before the next assertion.
const tick = () => {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
};

describe("GhCallLimiter", () => {
	test("runs every call while never exceeding the limit", async () => {
		let inFlight = 0;
		let peak = 0;
		const releases: Array<() => void> = [];
		const run: ExecGh = async (args) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			const answer = Promise.withResolvers<unknown>();
			releases.push(() => {
				inFlight--;
				answer.resolve(args[1]);
			});
			return answer.promise;
		};
		const limiter = new GhCallLimiter(run, 3);

		const calls = Array.from({ length: 10 }, (_, index) =>
			limiter.exec(["api", `call-${index}`]),
		);
		await tick();
		expect(peak).toBe(3);
		expect(releases).toHaveLength(3);

		while (releases.length > 0) {
			releases.shift()?.();
			await tick();
		}

		expect(peak).toBe(3);
		expect(await Promise.all(calls)).toEqual(
			Array.from({ length: 10 }, (_, index) => `call-${index}`),
		);
	});

	test("passes a failure to its own caller and frees the slot", async () => {
		const limiter = new GhCallLimiter(async (args) => {
			if (args[0] === "fail") throw new Error("gh exited 1");
			return "ok";
		}, 1);

		const failure = await limiter
			.exec(["fail"])
			.catch((error: Error) => error.message);
		expect(failure).toBe("gh exited 1");
		expect(await limiter.exec(["next"])).toBe("ok");
	});

	test("drains queued background calls and keeps a probe waiting", async () => {
		let started = 0;
		const releases: Array<() => void> = [];
		const limiter = new GhCallLimiter(() => {
			started++;
			const answer = Promise.withResolvers<unknown>();
			releases.push(() => answer.resolve("done"));
			return answer.promise;
		}, 1);

		const running = limiter.exec(["api", "first"]);
		const queued = limiter.exec(["api", "second"]);
		const probe = limiter.probe(["api", "third"]);
		await tick();
		expect(started).toBe(1);

		const offline = new Error("GitHub is unreachable from this host");
		limiter.drain(offline);

		expect(await queued.catch((error: Error) => error.message)).toBe(
			offline.message,
		);
		expect(started).toBe(1);

		releases.shift()?.();
		expect(await running).toBe("done");
		await tick();
		expect(started).toBe(2);

		releases.shift()?.();
		expect(await probe).toBe("done");
	});
});

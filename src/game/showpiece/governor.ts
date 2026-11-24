// Average actual inter-frame time, including the previous render. Phaser's
// smoothed delta deliberately masks slow frames and is unsuitable here.
export type Detail = 0 | 1 | 2;

export class DetailGovernor {
  tier: Detail;
  private last?: number;
  private elapsed = 0;
  private frames = 0;
  private headroomMs = 0;
  private nextUpgradeAt = 0;
  private cooldownMs = 30_000;

  constructor(private readonly pinned?: Detail) {
    this.tier = pinned ?? 2;
  }

  resetWindow(): void {
    this.last = undefined;
    this.elapsed = this.frames = this.headroomMs = 0;
  }

  sample(now: number): void {
    const gap = this.last === undefined ? 0 : now - this.last;
    this.last = now;
    if (this.pinned !== undefined || gap <= 0) return;
    this.elapsed += gap;
    this.frames++;
    if (this.elapsed < 750) return;
    const mean = this.elapsed / this.frames;
    this.headroomMs = mean < 17.5 ? this.headroomMs + this.elapsed : 0;
    this.elapsed = this.frames = 0;
    if (mean > 20 && this.tier > 0) {
      this.tier = this.tier === 2 ? 1 : 0;
      this.nextUpgradeAt = now + this.cooldownMs;
      this.cooldownMs *= 2;
    } else if (this.tier < 2 && now >= this.nextUpgradeAt && this.headroomMs >= 10_000) {
      this.tier = this.tier === 0 ? 1 : 2;
      this.headroomMs = 0;
    }
  }
}

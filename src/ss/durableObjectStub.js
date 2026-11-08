// In the browser there's no Cloudflare runtime: the room code (worker/index.js) only needs this base class to run
// inside the StudySmartly host's game (see src/studysmartly.js).
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}

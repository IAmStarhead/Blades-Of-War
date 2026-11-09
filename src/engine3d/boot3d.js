import { registerEngine3D } from "./scene3d.js";

registerEngine3D(typeof window !== "undefined" ? window : globalThis);

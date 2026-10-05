// `import x from "./file" with { type: "file" }` gives a path string (see server.ts).
declare module "*.css" {
  const path: string;
  export default path;
}

declare module "*.svg" {
  const path: string;
  export default path;
}

declare module "*.ico" {
  const path: string;
  export default path;
}

declare module "*.png" {
  const path: string;
  export default path;
}

declare module "*.webmanifest" {
  const path: string;
  export default path;
}

declare module "*/app.js" {
  const path: string;
  export default path;
}

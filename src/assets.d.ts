// `import x from "./file" with { type: "text" }` gives the file's contents (see server.ts).
declare module "*.css" {
  const text: string;
  export default text;
}

declare module "*.svg" {
  const text: string;
  export default text;
}

declare module "*/app.js" {
  const text: string;
  export default text;
}

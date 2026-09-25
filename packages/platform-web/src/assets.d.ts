// Vite turns `?url` imports into the final URL of the emitted asset.
declare module '*?url' {
  const url: string
  export default url
}

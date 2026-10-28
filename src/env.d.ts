/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** The signed-in user, set by src/middleware.ts. */
    user?: import('./server/auth/sessions').SessionUser;
    session?: import('./server/auth/sessions').Session;
    /** The raw session token from the cookie (needed to sign out). */
    sessionToken?: string;
  }
}

/** Mermaid's prebuilt browser bundle (src/scripts/diagrams.ts) has the API of the package entry point. */
declare module 'mermaid/dist/mermaid.esm.min.mjs' {
  export { default } from 'mermaid';
}

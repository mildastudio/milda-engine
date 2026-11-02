// Tier 2 (web) - one CSS declaration.
//
// This lived in `packages/core/facets/facets.ts` for as long as core produced declarations.
// Proposal 0045's last phase left it with no producers there at all, so it came out with
// them: a `{ prop, value }` pair in camelCase-property form is the CSSOM's shape and
// nothing else's. A native target resolves facets to typed neutrals (see
// `kernel/render.ts`) and never wants this type; that it used to be core's is the clearest
// single sign of how far the web had reached into the IR.

export interface StyleDecl {
  prop: string
  value: string
}

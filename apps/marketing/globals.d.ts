// Next declares these itself once `.next/types` exists, which it does not on a
// clean checkout — so the first `next build` fails typecheck on the stylesheet
// side-effect import. Declaring them here makes a fresh clone build first time.
declare module '*.css';

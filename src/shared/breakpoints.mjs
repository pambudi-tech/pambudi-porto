// The phone layout's widest viewport, in CSS pixels. The stylesheets' matching
// `@media (max-width: 540px)` rules use the same value.
export const PHONE_MAX_WIDTH = 540;
export const isPhone = width => width <= PHONE_MAX_WIDTH;
